import type {
  Finding,
  RemoteFindingSummary,
  SastFindingEvidence,
  SastFindingSummary,
  ScanResultRead,
  SinkClass,
  TaintStep,
} from "@whoami/types";

function mapSeverity(rawSeverity?: string): Finding["severity"] {
  const normalized = (rawSeverity || "low").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high" || normalized === "error") return "high";
  if (normalized === "medium" || normalized === "warn" || normalized === "warning")
    return "medium";
  return "low";
}

function detectSinkClass(title: string, desc?: string, code?: string): SinkClass {
  const text = `${title} ${desc || ""} ${code || ""}`.toLowerCase();
  if (
    text.includes("secret") ||
    text.includes("credential") ||
    text.includes("token") ||
    text.includes("trufflehog") ||
    text.includes("jwt") ||
    text.includes("api_key") ||
    text.includes("password") ||
    text.includes("cwe-798") ||
    text.includes("cwe-522")
  ) {
    return "secret-exposure";
  }
  if (
    text.includes("sql") ||
    (text.includes("injection") && text.includes("db")) ||
    text.includes("cwe-89")
  ) {
    return "sql-injection";
  }
  if (
    text.includes("ssrf") ||
    text.includes("request forgery") ||
    text.includes("open redirect") ||
    text.includes("cwe-918")
  ) {
    return "ssrf";
  }
  if (
    text.includes("exec") ||
    text.includes("command") ||
    text.includes("rce") ||
    text.includes("shell") ||
    text.includes("system-call") ||
    text.includes("cwe-78")
  ) {
    return "command-injection";
  }
  if (
    text.includes("traversal") ||
    text.includes("file read") ||
    text.includes("directory") ||
    text.includes("cwe-22")
  ) {
    return "path-traversal";
  }
  if (
    text.includes("eval") ||
    text.includes("code injection") ||
    text.includes("cwe-94")
  ) {
    return "code-injection";
  }
  if (
    text.includes("prototype") ||
    text.includes("pollution") ||
    text.includes("cwe-1321")
  ) {
    return "prototype-pollution";
  }
  return "ssrf";
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function parseLocation(
  locStr?: string,
  fallbackFile = "target",
  fallbackLine = 1,
): { file: string; line: number } {
  if (!locStr) return { file: fallbackFile, line: fallbackLine };
  const cleaned = locStr.replace(/\s*\([^)]*\)$/, "").trim();
  const match = cleaned.match(/^(.*?):(\d+)(?::\d+)?$/);
  if (match && match[1] && match[2]) {
    return { file: match[1], line: parseInt(match[2], 10) || fallbackLine };
  }
  return { file: cleaned || fallbackFile, line: fallbackLine };
}

function extractCwe(rawCwe?: string | string[]): string | undefined {
  if (!rawCwe) return undefined;
  if (Array.isArray(rawCwe)) {
    for (const item of rawCwe) {
      const match = String(item).match(/(CWE-\d+)/i);
      if (match && match[1]) return match[1].toUpperCase();
    }
    return undefined;
  }
  const match = String(rawCwe).match(/(CWE-\d+)/i);
  return match && match[1] ? match[1].toUpperCase() : rawCwe;
}

/**
 * Normalizes findings from remote scanners (DAST: Nuclei, HTTPX, Nmap and SAST: Joern CPG, Semgrep, TruffleHog)
 * into native WhoAmI Finding structures.
 */
export function normalizeRemoteFindings(
  result: ScanResultRead,
  targetValue = "target",
): Finding[] {
  const findings: Finding[] = [];
  const createdAt = result.created_at || new Date().toISOString();
  const rawFindings = result.summary?.findings || [];

  for (let i = 0; i < rawFindings.length; i++) {
    const raw = rawFindings[i]!;
    const isSastFinding = "code" in raw && typeof raw.code === "string";
    const findingId = `remote-${result.scan_job_id}-${i + 1}`;
    const severity = mapSeverity(raw.severity);

    if (isSastFinding) {
      const item = raw as SastFindingSummary;
      const evidence =
        typeof item.evidence === "object" && item.evidence !== null
          ? (item.evidence as SastFindingEvidence)
          : undefined;

      const codeStr = item.code || "";
      const isJoern = codeStr.startsWith("JOERN") || Boolean(evidence?.flow);
      const isTrufflehog =
        codeStr.startsWith("TRUFFLEHOG") || Boolean(evidence?.detector);
      const isSemgrep = codeStr.startsWith("SEMGREP") || Boolean(evidence?.check_id);

      const sinkClass = detectSinkClass(item.title, item.description, codeStr);
      const cwe =
        extractCwe(evidence?.cwe) ||
        (sinkClass === "sql-injection"
          ? "CWE-89"
          : sinkClass === "command-injection"
            ? "CWE-78"
            : sinkClass === "secret-exposure"
              ? "CWE-798"
              : sinkClass === "path-traversal"
                ? "CWE-22"
                : severity === "critical"
                  ? "CWE-94"
                  : "CWE-200");

      let traceSteps: TaintStep[] = [];

      // 1. Joern CPG with multi-step taint propagation flow
      if (isJoern && evidence?.flow && evidence.flow.length > 0) {
        const flow = evidence.flow;
        traceSteps = flow.map((step, idx) => {
          const parsed = parseLocation(
            step.location,
            evidence.file || targetValue,
            evidence.line || 1,
          );
          let role: TaintStep["role"] = "sanitizer";
          if (idx === 0 || step.type.toLowerCase().includes("source")) {
            role = "source";
          } else if (
            idx === flow.length - 1 ||
            step.type.toLowerCase().includes("sink")
          ) {
            role = "sink";
          }

          const varLabel = step.variable ? `${step.variable}: ` : "";
          return {
            role,
            label: `${varLabel}${step.type}`,
            filePath: parsed.file,
            line: parsed.line,
          };
        });
      } else if (isTrufflehog) {
        // 2. TruffleHog Secret Detection
        const parsed = parseLocation(
          evidence?.location,
          evidence?.file || targetValue,
          evidence?.line || 1,
        );
        const detectorName = evidence?.detector || "Secret";
        const verifiedLabel = evidence?.verified ? " [VERIFIED LIVE]" : "";

        traceSteps = [
          {
            role: "source",
            label: `Scanned File: ${parsed.file}`,
            filePath: parsed.file,
            line: parsed.line,
          },
          {
            role: "sink",
            label: `Exposed ${detectorName} Credential${verifiedLabel}`,
            filePath: parsed.file,
            line: parsed.line,
          },
        ];
      } else {
        // 3. Semgrep or Generic SAST
        const parsed = parseLocation(
          evidence?.location,
          evidence?.file || targetValue,
          evidence?.line || 1,
        );
        const checkId = evidence?.check_id || item.code || "sast-rule";
        const codeSnippet = evidence?.snippet
          ? `: ${evidence.snippet.substring(0, 60)}`
          : "";

        traceSteps = [
          {
            role: "source",
            label: `Entry Point: ${parsed.file}`,
            filePath: parsed.file,
            line: parsed.line,
          },
          {
            role: "sanitizer",
            label: `Pattern Rule: ${checkId}`,
            filePath: parsed.file,
            line: parsed.line,
          },
          {
            role: "sink",
            label: `Vulnerability Sink (Line ${parsed.line})${codeSnippet}`,
            filePath: parsed.file,
            line: parsed.line,
          },
        ];
      }

      const rotationLink =
        typeof evidence?.extra_data === "object" && evidence.extra_data
          ? String(evidence.extra_data.rotation_guide || "")
          : "";

      findings.push({
        id: findingId,
        ruleId: `remote-${slugify(codeStr || item.title)}`,
        status: "confirmed",
        severity,
        title: item.title,
        description: item.description,
        cwe,
        code: codeStr,
        scope: isTrufflehog ? "secrets" : "code",
        hint: item.remediation,
        fix: item.remediation,
        link: rotationLink || undefined,
        trace: {
          steps: traceSteps,
          sinkClass,
        },
        createdAt,
      });
    } else {
      // DAST Finding (Nuclei, Nmap, HTTPX, FFUF)
      const item = raw as RemoteFindingSummary;
      const ruleSlug = item.template_id || slugify(item.title);
      const hostOrPath = item.matched_at || item.host || targetValue;
      const sinkClass = detectSinkClass(item.title, item.description);
      const cwe =
        extractCwe(item.cwe) ||
        (severity === "critical"
          ? "CWE-94"
          : severity === "high"
            ? "CWE-200"
            : "CWE-16");

      const traceSteps: TaintStep[] = [
        {
          role: "source",
          label: `Target Scope: ${targetValue}`,
          filePath: hostOrPath,
          line: 1,
        },
        {
          role: "sanitizer",
          label: `Scanner Probe: ${item.title}`,
          filePath: hostOrPath,
          line: 1,
        },
        {
          role: "sink",
          label: `Vulnerable Endpoint: ${hostOrPath}`,
          filePath: hostOrPath,
          line: 1,
        },
      ];

      findings.push({
        id: findingId,
        ruleId: `remote-${ruleSlug}`,
        status: "confirmed",
        severity,
        title: item.title,
        description: item.description || `Detected on ${hostOrPath}`,
        cwe,
        code: item.template_id || "remote_vuln",
        scope: "endpoint",
        trace: {
          steps: traceSteps,
          sinkClass,
        },
        createdAt,
      });
    }
  }

  // If there are discovered technologies and no specific findings, create info finding
  if (
    findings.length === 0 &&
    result.summary?.technologies &&
    result.summary.technologies.length > 0
  ) {
    findings.push({
      id: `remote-${result.scan_job_id}-tech`,
      ruleId: "remote-tech-discovery",
      status: "confirmed",
      severity: "low",
      title: "Discovered Web Technologies",
      description: `Target ${targetValue} is running: ${result.summary.technologies.join(", ")}`,
      cwe: "CWE-200",
      scope: "endpoint",
      trace: {
        steps: [
          {
            role: "source",
            label: targetValue,
            filePath: targetValue,
            line: 1,
          },
          {
            role: "sink",
            label: "Tech Fingerprint",
            filePath: targetValue,
            line: 1,
          },
        ],
        sinkClass: "ssrf",
      },
      createdAt,
    });
  }

  return findings;
}
