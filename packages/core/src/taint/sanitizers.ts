import type {
  SanitizerPattern,
  SanitizerVerdict,
  SinkClass,
} from "@whoami/types";

/**
 * Known-safe sanitizer/guard pattern registry, keyed by SinkClass — the
 * deterministic half of docs/DETECTION-ENGINE-SPEC.md §A.3's
 * matchKnownSanitizerPattern(guard, sinkClass). Each entry's `test`
 * inspects the *source text of the guard itself* (a function body, or an
 * if-condition, found by src/taint/propagate.ts) — never the guard's name —
 * per the Yamaguchi et al. rationale in §A.0: real reachability/behavior
 * analysis, not a keyword heuristic.
 */
interface SanitizerRegistryEntry extends SanitizerPattern {
  readonly test: (guardSourceSnippet: string) => boolean;
}

const PRIVATE_OR_LOOPBACK_IP_REGEX =
  /(?:\b10\.|\b172\.(?:1[6-9]|2\d|3[0-1])\.|\b192\.168\.|\b127\.|\b169\.254\.|::1)/;

const HTTPS_SCHEME_CHECK_REGEX =
  /protocol\s*!==?\s*['"`]https:['"`]|protocol\s*===?\s*['"`]https:['"`]/;

const SANITIZER_REGISTRY: readonly SanitizerRegistryEntry[] = [
  {
    id: "ssrf-scheme-and-private-ip-allowlist",
    sinkClass: "ssrf",
    description:
      "Guard parses the URL, restricts the scheme to https:, and rejects RFC1918/loopback/" +
      "link-local hosts before the outbound call — see docs/DETECTION-ENGINE-SPEC.md §A.1.",
    test: (snippet) =>
      HTTPS_SCHEME_CHECK_REGEX.test(snippet) &&
      PRIVATE_OR_LOOPBACK_IP_REGEX.test(snippet),
  },
  {
    id: "sql-parameterized-placeholder",
    sinkClass: "sql-injection",
    description:
      "Query uses a parameterized placeholder ($1/?) or a Prisma $queryRaw tagged template " +
      "instead of building the query string by hand.",
    test: (snippet) => /\$\d+|\$queryRaw`|\.raw\(\s*['"`]\?['"`]/.test(snippet),
  },
  {
    id: "command-argv-execfile",
    sinkClass: "command-injection",
    description:
      "Call uses execFile/spawn (without shell:true) with an argv array instead of a shell string.",
    test: (snippet) => /execFile\(|spawn\([^,]+,\s*\[/.test(snippet),
  },
  {
    id: "path-normalize-and-prefix-check",
    sinkClass: "path-traversal",
    description:
      "Guard normalizes the path and checks the resolved path still starts with the allowed root.",
    test: (snippet) =>
      /normalize\(/.test(snippet) && /startsWith\(/.test(snippet),
  },
];

export const SANITIZER_PATTERNS: readonly SanitizerPattern[] =
  SANITIZER_REGISTRY.map(({ id, sinkClass, description }) => ({
    id,
    sinkClass,
    description,
  }));

/**
 * Deterministic-only pattern match — never involves an LLM call (see
 * @whoami/types' SanitizerVerdict doc comment). Returns 'known-safe' the
 * first time any registered pattern for this sinkClass matches the guard
 * text, otherwise 'no-match'.
 */
export function matchKnownSanitizerPattern(
  guardSourceSnippet: string,
  sinkClass: SinkClass,
): SanitizerVerdict {
  const matched = SANITIZER_REGISTRY.some(
    (entry) => entry.sinkClass === sinkClass && entry.test(guardSourceSnippet),
  );
  return matched ? "known-safe" : "no-match";
}
