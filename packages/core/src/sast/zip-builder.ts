import { deflateRawSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "env",
  "__pycache__",
  "dist",
  "build",
  "out",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".vscode",
  ".idea",
  ".DS_Store",
  ".env",
];

export const IGNORE_EXTENSIONS = new Set([
  ".zip",
  ".tar",
  ".gz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".iso",
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".mp4",
  ".mp3",
  ".mov",
  ".webp",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".pyc",
  ".pyo",
]);

// -------------------------------------------------------------
// CRC-32 Table Generation (Standard IEEE 802.3)
// -------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c;
}

export function calculateCrc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    const byte = data[i]!;
    const tableVal = CRC_TABLE[(crc ^ byte) & 0xff]!;
    crc = tableVal ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  readonly path: string;
  readonly data: Uint8Array;
}

export interface PackageDirectoryStats {
  totalFiles: number;
  includedFiles: number;
  excludedFiles: number;
  uncompressedBytes: number;
  compressedBytes: number;
}

/**
 * Builds a valid PKZIP 2.0 archive adhering to standard PK\x03\x04 specifications.
 */
export function buildZipArchive(entries: readonly ZipEntry[]): Uint8Array {
  const localHeaders: Uint8Array[] = [];
  const centralHeaders: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const normalizedPath = entry.path.replace(/\\/g, "/").replace(/^\/+/, "");
    const nameBytes = new TextEncoder().encode(normalizedPath);
    const uncompressedData = entry.data;
    const crc32 = calculateCrc32(uncompressedData);

    let compressedData = uncompressedData;
    let compressionMethod = 0; // Stored (no compression)

    // Attempt DEFLATE compression if payload > 32 bytes
    if (uncompressedData.length > 32) {
      try {
        const deflated = deflateRawSync(uncompressedData);
        if (deflated.length < uncompressedData.length) {
          compressedData = deflated;
          compressionMethod = 8; // DEFLATE
        }
      } catch {
        // Fall back to Stored
      }
    }

    // --- Local File Header (30 bytes + name) ---
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // PK\x03\x04
    lv.setUint16(4, 20, true); // Version needed to extract: 2.0
    lv.setUint16(6, 0, true); // General purpose bit flag
    lv.setUint16(8, compressionMethod, true); // Compression method
    lv.setUint16(10, 0, true); // Last mod time
    lv.setUint16(12, 0, true); // Last mod date
    lv.setUint32(14, crc32, true); // CRC-32
    lv.setUint32(18, compressedData.length, true); // Compressed size
    lv.setUint32(22, uncompressedData.length, true); // Uncompressed size
    lv.setUint16(26, nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length
    localHeader.set(nameBytes, 30);

    localHeaders.push(localHeader, compressedData);

    // --- Central Directory Header (46 bytes + name) ---
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // PK\x01\x02
    cv.setUint16(4, 20, true); // Version made by
    cv.setUint16(6, 20, true); // Version needed to extract
    cv.setUint16(8, 0, true); // Flags
    cv.setUint16(10, compressionMethod, true); // Compression method
    cv.setUint16(12, 0, true); // Last mod time
    cv.setUint16(14, 0, true); // Last mod date
    cv.setUint32(16, crc32, true); // CRC-32
    cv.setUint32(20, compressedData.length, true); // Compressed size
    cv.setUint32(24, uncompressedData.length, true); // Uncompressed size
    cv.setUint16(28, nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, offset, true); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralHeaders.push(centralHeader);

    offset += localHeader.length + compressedData.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  // --- End of Central Directory Record (22 bytes) ---
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // PK\x05\x06
  ev.setUint16(4, 0, true); // Number of this disk
  ev.setUint16(6, 0, true); // Disk with central directory
  ev.setUint16(8, entries.length, true); // Total entries on this disk
  ev.setUint16(10, entries.length, true); // Total entries in central directory
  ev.setUint32(12, centralDirSize, true); // Size of central directory
  ev.setUint32(16, centralDirOffset, true); // Offset of start of central directory
  ev.setUint16(20, 0, true); // Comment length

  const totalLength = offset + centralDirSize + 22;
  const result = new Uint8Array(totalLength);
  let pos = 0;

  for (const piece of localHeaders) {
    result.set(piece, pos);
    pos += piece.length;
  }
  for (const piece of centralHeaders) {
    result.set(piece, pos);
    pos += piece.length;
  }
  result.set(eocd, pos);

  return result;
}

export function isFileIgnored(relPath: string, customIgnores: readonly string[] = []): boolean {
  const normalized = relPath.replace(/\\/g, "/");
  const segments = normalized.split("/");

  // Directory segment check
  for (const seg of segments) {
    if (DEFAULT_IGNORE_PATTERNS.includes(seg)) return true;
    if (customIgnores.includes(seg)) return true;
  }

  // File extension check
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex !== -1) {
    const ext = normalized.slice(dotIndex).toLowerCase();
    if (IGNORE_EXTENSIONS.has(ext)) return true;
  }

  return false;
}

/**
 * Traverses a local directory and creates an optimized in-memory ZIP archive
 * suitable for submission to Codefy SAST.
 */
export function packageWorkspaceDirectory(
  rootDir: string,
  options: {
    maxFiles?: number;
    maxBytes?: number;
    customIgnores?: readonly string[];
  } = {},
): { zipData: Uint8Array; stats: PackageDirectoryStats } {
  const maxFiles = options.maxFiles ?? 2000;
  const maxBytes = options.maxBytes ?? 50 * 1024 * 1024; // 50MB SAST limit
  const customIgnores = options.customIgnores ?? [];

  const stats: PackageDirectoryStats = {
    totalFiles: 0,
    includedFiles: 0,
    excludedFiles: 0,
    uncompressedBytes: 0,
    compressedBytes: 0,
  };

  const entries: ZipEntry[] = [];

  function walk(currentDir: string): void {
    if (!existsSync(currentDir)) return;
    const items = readdirSync(currentDir);

    for (const item of items) {
      const fullPath = join(currentDir, item);
      const relPath = relative(rootDir, fullPath).replace(/\\/g, "/");

      if (isFileIgnored(relPath, customIgnores)) {
        stats.excludedFiles++;
        continue;
      }

      const st = statSync(fullPath);
      if (st.isDirectory()) {
        walk(fullPath);
      } else if (st.isFile()) {
        stats.totalFiles++;

        if (stats.includedFiles >= maxFiles || stats.uncompressedBytes + st.size > maxBytes) {
          stats.excludedFiles++;
          continue;
        }

        try {
          const content = readFileSync(fullPath);
          entries.push({
            path: relPath,
            data: new Uint8Array(content.buffer, content.byteOffset, content.byteLength),
          });
          stats.includedFiles++;
          stats.uncompressedBytes += st.size;
        } catch {
          stats.excludedFiles++;
        }
      }
    }
  }

  walk(rootDir);

  const zipData = buildZipArchive(entries);
  stats.compressedBytes = zipData.length;

  return { zipData, stats };
}
