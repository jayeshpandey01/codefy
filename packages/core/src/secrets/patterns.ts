import type { SecretKind } from "@whoami/types";

/**
 * Regex registry for in-process secret detection — see CLAUDE.md's "Why
 * In-Process Secret Detection, Not TruffleHog" ADR. No network calls, no
 * external binary — same technique class TruffleHog/Gitleaks use for
 * unverified (non-network) detection.
 */
export interface SecretRegexPattern {
  readonly kind: Exclude<SecretKind, "high-entropy-string">;
  readonly regex: RegExp;
}

export const SECRET_REGEX_PATTERNS: readonly SecretRegexPattern[] = [
  { kind: "aws-access-key", regex: /AKIA[0-9A-Z]{16}/g },
  // GitHub token prefixes: ghp_ (personal), gho_ (oauth), ghu_ (user-to-server),
  // ghs_ (server-to-server), ghr_ (refresh).
  { kind: "github-token", regex: /gh[pousr]_[A-Za-z0-9]{36}/g },
  {
    kind: "generic-api-key",
    regex:
      /\b(?:api[_-]?key|secret|token)\b\s*[:=]\s*['"`]([A-Za-z0-9\-_]{20,})['"`]/gi,
  },
];
