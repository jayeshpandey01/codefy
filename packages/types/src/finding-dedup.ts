import type { Finding, FindingStatus, Severity } from "./findings.js";

const STATUS_PRIORITY: Record<FindingStatus, number> = {
  confirmed: 3,
  "needs-verification": 2,
  discarded: 1,
};

/**
 * Normalizes a ruleId or code or vulnerability title to a canonical category
 * so that detections from different rules/tools identifying the same underlying
 * vulnerability at the same location are identified as duplicates.
 */
export function normalizeVulnerabilityType(finding: Finding): string {
  if (finding.cwe && finding.cwe.startsWith("CWE-")) {
    return finding.cwe.trim().toUpperCase();
  }
  const idStr = `${finding.ruleId || ""} ${finding.code || ""} ${finding.title || ""}`.toLowerCase();

  if (idStr.includes("sql-injection") || idStr.includes("sqli") || idStr.includes("cwe-89")) return "SQL_INJECTION";
  if (idStr.includes("command-injection") || idStr.includes("os-command") || idStr.includes("cwe-78")) return "COMMAND_INJECTION";
  if (idStr.includes("path-traversal") || idStr.includes("traversal") || idStr.includes("cwe-22")) return "PATH_TRAVERSAL";
  if (idStr.includes("ssrf") || idStr.includes("cwe-918")) return "SSRF";
  if (idStr.includes("code-injection") || idStr.includes("cwe-94") || idStr.includes("cwe-95")) return "CODE_INJECTION";
  if (idStr.includes("xss") || idStr.includes("cross-site") || idStr.includes("cwe-79")) return "XSS";
  if (idStr.includes("secret") || idStr.includes("cwe-798") || finding.scope === "secrets") {
    return `SECRET_${finding.ruleId.replace(/^secret-/, "").toUpperCase()}`;
  }
  if (idStr.includes("syntax") || finding.scope === "parser") return "SYNTAX_ERROR";

  // DAST check codes / headers / ports
  if (finding.code) return finding.code.toUpperCase();
  return (finding.ruleId || finding.title || "UNKNOWN").toUpperCase();
}

/**
 * Computes a stable deduplication key representing the logical bug/issue.
 * - SAST / Code / Secrets: based on clean relative file path, line number, and vulnerability type.
 * - DAST / Remote: based on host, target port/path, and vulnerability check.
 */
export function getFindingDeduplicationKey(finding: Finding): string {
  const steps = finding.trace?.steps || [];
  const sinkStep = steps.find((s) => s.role === "sink");
  const rawTrace = finding.trace as unknown as Record<string, any> | undefined;
  const legacySink = rawTrace?.sink;
  const legacySource = rawTrace?.source;
  const primaryStep =
    sinkStep ||
    (steps.length > 0 ? steps[steps.length - 1] : undefined) ||
    steps[0] ||
    legacySink ||
    legacySource;
  const isRemote =
    finding.scope === "orchestrator" ||
    finding.scope === "endpoint" ||
    finding.id.startsWith("remote-") ||
    finding.ruleId.startsWith("remote-");

  const rawPath = primaryStep?.filePath || "";
  const cleanPath = rawPath.replace(/\\/g, "/").replace(/^https?:\/\/[^/]+\/?/, "");
  const line = primaryStep?.line || 1;
  const vulnType = normalizeVulnerabilityType(finding);

  if (isRemote) {
    const host = rawPath.replace(/^[a-z]+:\/\//, "").split("/")[0] || "endpoint";
    return `remote:${host}:${cleanPath}:${vulnType}`;
  }

  // Local / SAST / Secrets
  const normalizedFile = cleanPath.toLowerCase();
  return `sast:${normalizedFile}:${line}:${vulnType}`;
}

/**
 * Deduplicates a list of findings, returning an array with exactly one entry per
 * unique bug/issue. When duplicate findings occur, the highest quality finding
 * (confirmed status, more trace steps, has fix) is preserved.
 */
export function deduplicateFindings(findings: readonly Finding[]): Finding[] {
  if (!findings || findings.length <= 1) {
    return findings ? [...findings] : [];
  }

  const map = new Map<string, Finding>();

  for (const finding of findings) {
    const key = getFindingDeduplicationKey(finding);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, finding);
      continue;
    }

    // Merge / pick the better finding
    const existingStatusScore = STATUS_PRIORITY[existing.status] || 0;
    const currentStatusScore = STATUS_PRIORITY[finding.status] || 0;

    let preferCurrent = false;
    if (currentStatusScore > existingStatusScore) {
      preferCurrent = true;
    } else if (currentStatusScore === existingStatusScore) {
      const existingSteps = existing.trace?.steps?.length || 0;
      const currentSteps = finding.trace?.steps?.length || 0;
      if (currentSteps > existingSteps) {
        preferCurrent = true;
      } else if (currentSteps === existingSteps) {
        if (!existing.fix && finding.fix) {
          preferCurrent = true;
        } else if (!existing.ruleYaml && finding.ruleYaml) {
          preferCurrent = true;
        }
      }
    }

    if (preferCurrent) {
      map.set(key, {
        ...finding,
        createdAt: existing.createdAt || finding.createdAt,
      });
    }
  }

  return Array.from(map.values());
}
