import type { FindingFilter, FindingStatus, SinkClass, Severity } from "@whoami/types";

import {
  SEVERITY_SYNONYMS,
  SINK_CLASS_SYNONYMS,
  STATUS_SYNONYMS,
} from "./synonyms.js";

/** Lowercase + collapse whitespace. The grammar matches on phrases/substrings,
 * not tokens, so this is normalization rather than true tokenization — see
 * docs/CHAT-QUERY-ENGINE-SPEC.md §B.7. */
export function normalizeQuery(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Every dictionary key present in `normalized`, longest-first, so a
 * multi-word phrase ("sql injection") is checked before any single-word
 * key that happens to be a substring of it. */
function matchAllPhrases<T>(
  normalized: string,
  dict: Record<string, T>,
): T[] {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  const matched: T[] = [];
  const seen = new Set<T>();
  for (const key of keys) {
    if (normalized.includes(key)) {
      const value = dict[key]!;
      if (!seen.has(value)) {
        seen.add(value);
        matched.push(value);
      }
    }
  }
  return matched;
}

export function extractSeverities(normalized: string): Severity[] {
  return matchAllPhrases(normalized, SEVERITY_SYNONYMS);
}

export function extractStatuses(normalized: string): FindingStatus[] {
  return matchAllPhrases(normalized, STATUS_SYNONYMS);
}

export function extractSinkClass(normalized: string): SinkClass | undefined {
  return matchAllPhrases(normalized, SINK_CLASS_SYNONYMS)[0];
}

const CWE_PATTERN = /cwe-?(\d+)/i;

export function extractCwe(text: string): string | undefined {
  const match = CWE_PATTERN.exec(text);
  return match ? `CWE-${match[1]}` : undefined;
}

// Matches WhoAmI's example finding-id scheme (e.g. "F-10291") and the
// orchestrator's remote-finding ids (e.g. "remote-recon-1699999999-0") —
// any hyphenated alphanumeric token containing at least one digit. Excludes
// "cwe-NNN" tokens: those name a vulnerability category (see extractCwe
// below), never a literal finding id, and would otherwise false-positive
// match here, sending "explain cwe-798" down a doomed exact-id lookup.
const FINDING_ID_PATTERN =
  /\b(?!cwe-?\d)([a-z][a-z0-9]*(?:-[a-z0-9]+)*-\d[a-z0-9-]*)\b/i;

/** Extracted from the *original* (non-lowercased) text so the returned id
 * preserves whatever casing the real Finding.id uses. */
export function extractFindingId(rawText: string): string | undefined {
  const match = FINDING_ID_PATTERN.exec(rawText);
  return match ? match[1] : undefined;
}

export function extractFilter(normalized: string, rawText: string): FindingFilter | undefined {
  const severity = extractSeverities(normalized);
  const status = extractStatuses(normalized);
  const sinkClass = extractSinkClass(normalized);
  const cwe = extractCwe(rawText);

  if (severity.length === 0 && status.length === 0 && !sinkClass && !cwe) {
    return undefined;
  }

  const filter: {
    severity?: readonly Severity[];
    status?: readonly FindingStatus[];
    sinkClass?: SinkClass;
    cwe?: string;
  } = {};
  if (severity.length > 0) filter.severity = severity;
  if (status.length > 0) filter.status = status;
  if (sinkClass) filter.sinkClass = sinkClass;
  if (cwe) filter.cwe = cwe;
  return filter;
}
