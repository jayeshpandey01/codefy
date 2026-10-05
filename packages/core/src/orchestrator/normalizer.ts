import type {
  DastJobDetailResponse,
  Finding,
  RemoteFindingSummary,
  SastFindingEvidence,
  SastFindingSummary,
  SastJobDetailResponse,
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
    text.includes("gitleaks") ||
    text.includes("entropy") ||
    text.includes("cors") ||
    text.includes("cwe-942") ||
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
    text.includes("crlf") ||
    text.includes("cwe-113") ||
    text.includes("cwe-918")
  ) {
    return "ssrf";
  }
  if (
    text.includes("xss") ||
    text.includes("cross-site scripting") ||
    text.includes("ssti") ||
    text.includes("template injection") ||
    text.includes("eval") ||
    text.includes("code injection") ||
    text.includes("cwe-79") ||
    text.includes("cwe-94") ||
    text.includes("cwe-1336")
  ) {
    return "code-injection";
  }
  if (
    text.includes("exec") ||
    text.includes("command") ||
    /\b(exec|execa|spawn|command|shell|system-call)\b/i.test(text) ||
    text.includes("rce") ||
    text.includes("shell") ||
    text.includes("system-call") ||
    text.includes("command injection") ||
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

export interface NormalizeRemoteFindingsOptions {
  isSast?: boolean;
  profile?: string;
}

/**
 * Normalizes findings from remote scanners (DAST: Nuclei, HTTPX, Nmap and SAST: Joern CPG, Semgrep, TruffleHog)
 * into native WhoAmI Finding structures.
 */
export function normalizeRemoteFindings(
  result: ScanResultRead,
  targetValue = "target",
  options?: NormalizeRemoteFindingsOptions,
): Finding[] {
  const findings: Finding[] = [];
  const createdAt = result.created_at || new Date().toISOString();
  const rawFindings = result.summary?.findings || [];

  for (let i = 0; i < rawFindings.length; i++) {
    const raw = rawFindings[i]!;
    const rawAny = raw as unknown as Record<string, unknown>;
    const rawCode = typeof rawAny.code === "string" ? rawAny.code : "";
    const evidenceObj =
      typeof rawAny.evidence === "object" && rawAny.evidence !== null
        ? (rawAny.evidence as Record<string, unknown>)
        : undefined;

    const hasSastToolPrefix =
      rawCode.startsWith("JOERN") ||
      rawCode.startsWith("SEMGREP") ||
      rawCode.startsWith("TRUFFLEHOG") ||
      rawCode.startsWith("GITLEAKS") ||
      rawCode.startsWith("CODEQL") ||
      rawCode.startsWith("AST_GREP");

    const hasSastEvidence = Boolean(
      evidenceObj?.flow ||
      evidenceObj?.detector ||
      evidenceObj?.check_id ||
      (typeof evidenceObj?.file === "string" &&
        !evidenceObj.file.includes("://") &&
        /\.(tsx?|jsx?|py|java|go|c|cpp|rs|php|rb|html|vue|svelte)$/i.test(evidenceObj.file))
    );

    const hasDastIndicators = Boolean(
      rawAny.matched_at ||
      rawAny.template_id ||
      rawAny.host ||
      rawCode.startsWith("SEC_HEADER_") ||
      rawCode.startsWith("SSL_") ||
      rawCode.startsWith("TLS_") ||
      rawCode.startsWith("CORS_") ||
      rawCode.startsWith("CSP_") ||
      rawCode.startsWith("WAF_") ||
      rawCode.startsWith("PORT_") ||
      rawCode.startsWith("OPEN_PORT_") ||
      rawCode.startsWith("DNS_") ||
      rawCode.startsWith("NUCLEI_") ||
      rawCode.startsWith("DALFOX_") ||
      rawCode.startsWith("KATANA_") ||
      rawCode.startsWith("HTTPX_") ||
      rawCode.startsWith("FEROX_") ||
      rawCode.startsWith("FFUF_") ||
      rawCode.startsWith("ZAP_") ||
      rawCode.startsWith("NIKTO_")
    );

    let isSastFinding: boolean;
    if (options?.isSast !== undefined) {
      isSastFinding = options.isSast;
    } else if (options?.profile) {
      isSastFinding = options.profile.startsWith("sast-");
    } else if (hasDastIndicators) {
      isSastFinding = false;
    } else if (hasSastToolPrefix || hasSastEvidence) {
      isSastFinding = true;
    } else {
      isSastFinding = "code" in raw && typeof raw.code === "string";
    }

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
      const isGitleaks =
        codeStr.startsWith("GITLEAKS") ||
        item.title.toLowerCase().includes("gitleaks") ||
        codeStr.toLowerCase().includes("entropy");
      const isCodeql =
        codeStr.startsWith("CODEQL") ||
        item.title.toLowerCase().includes("codeql");
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

      // 1. Joern CPG or CodeQL with multi-step taint propagation flow
      if ((isJoern || isCodeql) && evidence?.flow && evidence.flow.length > 0) {
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
      } else if (isTrufflehog || isGitleaks) {
        // 2. Secret Detection (TruffleHog / Gitleaks)
        const parsed = parseLocation(
          evidence?.location,
          evidence?.file || targetValue,
          evidence?.line || 1,
        );
        const detectorName =
          evidence?.detector || (isGitleaks ? "Gitleaks Entropy Secret" : "Secret");
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
        // 3. Semgrep, CodeQL single-step, or Generic SAST
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
        scope: isTrufflehog || isGitleaks ? "secrets" : "code",
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
      // DAST Finding (Nuclei, Nmap, HTTPX, FFUF, Dalfox, etc.)
      const item = raw as RemoteFindingSummary & { code?: string };
      const rawCode = typeof item.code === "string" ? item.code : "";
      const ruleSlug = item.template_id || (rawCode ? slugify(rawCode) : slugify(item.title));
      const hostOrPath = item.matched_at || item.host || targetValue;
      const sinkClass = detectSinkClass(item.title, item.description, rawCode);
      const titleLower = item.title.toLowerCase();
      const cwe =
        extractCwe(item.cwe) ||
        (titleLower.includes("xss") || titleLower.includes("cross-site scripting")
          ? "CWE-79"
          : titleLower.includes("ssti") || titleLower.includes("template injection")
            ? "CWE-1336"
            : titleLower.includes("crlf")
              ? "CWE-113"
              : titleLower.includes("cors")
                ? "CWE-942"
                : titleLower.includes("takeover")
                  ? "CWE-284"
                  : severity === "critical"
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
        code: rawCode || item.template_id || "remote_vuln",
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

export function normalizeSastJobFindings(
  job: SastJobDetailResponse,
  targetValue = "codebase",
): Finding[] {
  const createdAt = job.created_at || new Date().toISOString();
  return job.findings.map((f, i) => {
    const findingId = `sast-${job.job_id}-${f.fingerprint.slice(0, 8)}-${i + 1}`;
    const severity = mapSeverity(f.severity);
    const sinkClass = detectSinkClass(f.title, f.description || "", f.vulnerability_id);
    const cwe = extractCwe(f.cwe_id ?? undefined) || "CWE-200";
    const filePath = f.file_path || targetValue;
    const line = f.line_start || 1;

    const traceSteps: TaintStep[] = [
      {
        role: "source",
        label: `File: ${filePath}`,
        filePath,
        line,
      },
      {
        role: "sink",
        label: `${f.title} (${f.detected_by?.length ? f.detected_by.join(", ") : f.tool_name})`,
        filePath,
        line,
      },
    ];

    return {
      id: findingId,
      ruleId: f.vulnerability_id || `sast-${f.tool_name}`,
      status: "confirmed",
      severity,
      title: f.title,
      description: f.description || f.title,
      cwe,
      scope: "orchestrator",
      remediation: f.remediation || undefined,
      trace: {
        steps: traceSteps,
        sinkClass,
      },
      createdAt,
    };
  });
}

export function normalizeDastJobFindings(
  job: DastJobDetailResponse,
  targetUrl = "target",
): Finding[] {
  const createdAt = job.created_at || new Date().toISOString();
  const target = job.target_url || targetUrl;
  return job.findings.map((f, i) => {
    const findingId = `dast-${job.job_id}-${f.fingerprint.slice(0, 8)}-${i + 1}`;
    const severity = mapSeverity(f.severity);
    const sinkClass = detectSinkClass(f.title, f.rule_id || "", f.owasp_category || "");
    const cwe = extractCwe(f.cwe_id ?? undefined) || "CWE-200";
    const url = f.target_url || target;

    const traceSteps: TaintStep[] = [
      {
        role: "source",
        label: `Target URL: ${url}`,
        filePath: url,
        line: 1,
      },
      {
        role: "sink",
        label: `${f.title} [${f.tool_name}]${f.parameter ? ` (param: ${f.parameter})` : ""}`,
        filePath: url,
        line: 1,
      },
    ];

    return {
      id: findingId,
      ruleId: f.rule_id || f.vulnerability_id || `dast-${f.tool_name}`,
      status: "confirmed",
      severity,
      title: f.title,
      description: `${f.title} detected on ${url}${f.parameter ? ` (parameter: ${f.parameter})` : ""}`,
      cwe,
      scope: "orchestrator",
      remediation: f.remediation || undefined,
      trace: {
        steps: traceSteps,
        sinkClass,
      },
      createdAt,
    };
  });
}

export const convertScanResultToFindings = normalizeRemoteFindings;
