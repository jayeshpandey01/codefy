import type { EntropyResult, SecretFinding } from "@whoami/types";

import { calculateShannonEntropy } from "./entropy.js";
import { SECRET_REGEX_PATTERNS } from "./patterns.js";

const HIGH_ENTROPY_THRESHOLD = 4.0;
const HIGH_ENTROPY_MIN_LENGTH = 20;
/** Quoted string literals that are long/random-looking enough to bother entropy-checking. */
const CANDIDATE_TOKEN_RE = /['"`]([A-Za-z0-9+/=_-]{20,})['"`]/g;

let findingCounter = 0;
function nextId(prefix: string): string {
  findingCounter += 1;
  return `${prefix}-${findingCounter}`;
}

function lineNumberAt(sourceCode: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (sourceCode[i] === "\n") line += 1;
  }
  return line;
}

function withGlobalFlag(regex: RegExp): RegExp {
  return regex.global ? regex : new RegExp(regex.source, `${regex.flags}g`);
}

const IGNORED_SECRET_FILES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "composer.lock",
  "cargo.lock",
  "gemfile.lock",
]);

export function isIgnoredSecretFile(filePath: string): boolean {
  const name = filePath.split(/[/\\]/).pop()?.toLowerCase() || "";
  if (IGNORED_SECRET_FILES.has(name)) return true;
  if (name.endsWith(".lock")) return true;
  if (
    name.endsWith(".min.js") ||
    name.endsWith(".min.css") ||
    name.endsWith(".map") ||
    name.endsWith(".d.ts")
  ) {
    return true;
  }
  return false;
}

/**
 * Combines the regex registry (patterns.ts) with Shannon-entropy scoring
 * (entropy.ts) into one in-process scan — see CLAUDE.md's "Why In-Process
 * Secret Detection, Not TruffleHog" ADR. No live "is this credential still
 * active" verification in Phase 1; that stays an explicit, user-triggered
 * future feature, never part of this automatic scan.
 */
export function scanForSecrets(
  sourceCode: string,
  filePath: string,
): SecretFinding[] {
  if (isIgnoredSecretFile(filePath)) {
    return [];
  }

  const findings: SecretFinding[] = [];
  const seenRanges = new Set<string>();

  for (const { kind, regex } of SECRET_REGEX_PATTERNS) {
    const re = withGlobalFlag(regex);
    let match: RegExpExecArray | null;
    while ((match = re.exec(sourceCode))) {
      const matchedText = match[0];
      const rangeKey = `${match.index}:${match.index + matchedText.length}`;
      if (seenRanges.has(rangeKey)) continue;
      seenRanges.add(rangeKey);

      findings.push({
        id: nextId(kind),
        kind,
        filePath,
        line: lineNumberAt(sourceCode, match.index),
        matchedPattern: matchedText,
      });
    }
  }

  const tokenRe = withGlobalFlag(CANDIDATE_TOKEN_RE);
  let tokenMatch: RegExpExecArray | null;
  while ((tokenMatch = tokenRe.exec(sourceCode))) {
    const value = tokenMatch[1] ?? "";
    if (value.length < HIGH_ENTROPY_MIN_LENGTH) continue;

    // Suppress package integrity checksums, URLs, data URIs, and pure hexadecimal hashes
    if (
      value.startsWith("sha512-") ||
      value.startsWith("sha384-") ||
      value.startsWith("sha256-") ||
      value.startsWith("sha1-") ||
      value.startsWith("http://") ||
      value.startsWith("https://") ||
      value.startsWith("data:") ||
      /^[a-f0-9]{32,128}$/i.test(value)
    ) {
      continue;
    }

    const rangeKey = `${tokenMatch.index}:${tokenMatch.index + tokenMatch[0].length}`;
    if (seenRanges.has(rangeKey)) continue;

    const shannonEntropy = calculateShannonEntropy(value);
    if (shannonEntropy < HIGH_ENTROPY_THRESHOLD) continue;
    seenRanges.add(rangeKey);

    const entropy: EntropyResult = {
      value,
      shannonEntropy,
      threshold: HIGH_ENTROPY_THRESHOLD,
    };
    findings.push({
      id: nextId("high-entropy-string"),
      kind: "high-entropy-string",
      filePath,
      line: lineNumberAt(sourceCode, tokenMatch.index),
      entropy,
    });
  }

  return findings;
}
