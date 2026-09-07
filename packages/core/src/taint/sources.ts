/**
 * JS/TS source pattern registry — see docs/DETECTION-ENGINE-SPEC.md §A.1's
 * JS/TS table. Every vulnerability class in Phase 1 shares the same source
 * set (req.body/req.query/req.params/req.headers/req.cookies/request.json()),
 * so this registry is not sink-class-specific.
 */
export interface SourcePattern {
  readonly id: string;
  readonly label: string;
  readonly regex: RegExp;
}

export const JS_TS_SOURCE_PATTERNS: readonly SourcePattern[] = [
  { id: "req-body", label: "req.body", regex: /\breq\.body\b/ },
  { id: "req-query", label: "req.query", regex: /\breq\.query\b/ },
  { id: "req-params", label: "req.params", regex: /\breq\.params\b/ },
  { id: "req-headers", label: "req.headers", regex: /\breq\.headers\b/ },
  { id: "req-cookies", label: "req.cookies", regex: /\breq\.cookies\b/ },
  { id: "request-json", label: "request.json()", regex: /\brequest\.json\(\)/ },
  { id: "request-url", label: "request.url", regex: /\b(request|req)\.(url|nextUrl)\b/ },
  { id: "search-params", label: "searchParams", regex: /\bsearchParams\b/ },
  { id: "process-argv", label: "process.argv", regex: /\bprocess\.argv\b/ },
  { id: "process-env", label: "process.env", regex: /\bprocess\.env\b/ },
  { id: "location-search", label: "location.search", regex: /\b(window\.)?location\.(search|href|hash)\b/ },
];

/** Returns the first known source pattern whose regex appears in `text`, if any. */
export function findSourceMatch(text: string): SourcePattern | undefined {
  return JS_TS_SOURCE_PATTERNS.find((pattern) => pattern.regex.test(text));
}
