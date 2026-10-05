import { describe, expect, it } from "vitest";
import {
  buildZipArchive,
  calculateCrc32,
  isFileIgnored,
} from "../../sast/zip-builder.js";

describe("zip-builder", () => {
  it("calculates CRC-32 correctly", () => {
    const data = new TextEncoder().encode("123456789");
    const crc = calculateCrc32(data);
    // Standard IEEE 802.3 CRC-32 for "123456789" is 0xcbf43926
    expect(crc).toBe(0xcbf43926);
  });

  it("builds a valid ZIP archive starting with PK\\x03\\x04 magic bytes", () => {
    const entries = [
      {
        path: "hello.txt",
        data: new TextEncoder().encode("Hello, Codefy SAST!"),
      },
      {
        path: "src/index.ts",
        data: new TextEncoder().encode("export const version = '1.0.0';"),
      },
    ];

    const zip = buildZipArchive(entries);

    expect(zip.length).toBeGreaterThan(0);
    // Check magic bytes PK\x03\x04
    expect(zip[0]).toBe(0x50); // P
    expect(zip[1]).toBe(0x4b); // K
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
  });

  it("correctly identifies ignored files and directories", () => {
    expect(isFileIgnored(".git/config")).toBe(true);
    expect(isFileIgnored("node_modules/express/index.js")).toBe(true);
    expect(isFileIgnored(".venv/bin/python")).toBe(true);
    expect(isFileIgnored("__pycache__/app.cpython-311.pyc")).toBe(true);
    expect(isFileIgnored("images/photo.png")).toBe(true);
    expect(isFileIgnored("app.zip")).toBe(true);
    expect(isFileIgnored("dist/bundle.js")).toBe(true);

    // Should NOT be ignored
    expect(isFileIgnored("src/index.ts")).toBe(false);
    expect(isFileIgnored("app/services/cache.py")).toBe(false);
    expect(isFileIgnored("Dockerfile")).toBe(false);
    expect(isFileIgnored("package.json")).toBe(false);
  });
});
