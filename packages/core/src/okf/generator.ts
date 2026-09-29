import type {
  Finding,
  OkfBundle,
  OkfDocument,
  Severity,
  WorkspaceGraph,
} from "@whoami/types";

/**
 * Generates an Open Knowledge Format (OKF) bundle from active workspace findings
 * and the structural WorkspaceGraph.
 *
 * OKF provides a high-density, structured markdown/JSON knowledge projection
 * optimized for sub-millisecond retrieval (TrainIQ BM25) and grounded LLM reasoning
 * with zero context truncation.
 */
export function generateOkfBundle(
  findings: readonly Finding[] = [],
  workspaceGraph?: WorkspaceGraph,
  rootPath = "",
): OkfBundle {
  const generatedAt = new Date().toISOString();

  return {
    repository: generateRepositoryDoc(findings, workspaceGraph, rootPath, generatedAt),
    architecture: generateArchitectureDoc(findings, workspaceGraph, generatedAt),
    securityFindings: generateSecurityFindingsDoc(findings, generatedAt),
    services: generateServicesDoc(workspaceGraph, generatedAt),
    generatedAt,
    workspacePath: rootPath,
  };
}

function generateRepositoryDoc(
  findings: readonly Finding[],
  graph: WorkspaceGraph | undefined,
  rootPath: string,
  updatedAt: string,
): OkfDocument {
  const fileNodes = graph?.nodes.filter((n) => n.type === "file") ?? [];
  const dirNodes = graph?.nodes.filter((n) => n.type === "directory") ?? [];

  const severityCounts: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const f of findings) {
    if (severityCounts[f.severity] !== undefined) {
      severityCounts[f.severity]++;
    }
  }

  const confirmedCount = findings.filter((f) => f.status === "confirmed").length;
  const needsVerificationCount = findings.filter(
    (f) => f.status === "needs-verification",
  ).length;

  const content = `# Repository Overview & Knowledge Projection

- **Root Workspace Path:** \`${rootPath || "."}\`
- **Total Indexed Files:** ${fileNodes.length}
- **Total Directories:** ${dirNodes.length}
- **Generated At:** ${updatedAt}

## Security Posture Summary
- **Total Security Findings:** ${findings.length}
- **Confirmed Vulnerabilities:** ${confirmedCount}
- **Needs Verification:** ${needsVerificationCount}
- **Severity Breakdown:**
  - **Critical:** ${severityCounts.critical}
  - **High:** ${severityCounts.high}
  - **Medium:** ${severityCounts.medium}
  - **Low:** ${severityCounts.low}

## File Inventory (Sample)
${fileNodes
  .slice(0, 30)
  .map((f) => `- \`${f.filePath}\`${f.findingCount ? ` (${f.findingCount} finding(s), highest: ${f.highestSeverity})` : ""}`)
  .join("\n")}
${fileNodes.length > 30 ? `\n*... and ${fileNodes.length - 30} more files.*\n` : ""}
`;

  return {
    filename: "repository.md",
    type: "repository",
    title: "Repository Overview",
    content,
    updatedAt,
  };
}

function generateArchitectureDoc(
  findings: readonly Finding[],
  graph: WorkspaceGraph | undefined,
  updatedAt: string,
): OkfDocument {
  const fileNodes = graph?.nodes.filter((n) => n.type === "file") ?? [];
  const filesWithFindings = fileNodes.filter((n) => (n.findingCount ?? 0) > 0);

  const importEdges = graph?.edges.filter((e) => e.type === "imports") ?? [];
  const callEdges = graph?.edges.filter((e) => e.type === "calls") ?? [];

  const content = `# Architecture & Component Topology

## High-Risk Modules
${
  filesWithFindings.length === 0
    ? "No high-risk files flagged with active security findings."
    : filesWithFindings
        .map(
          (f) =>
            `- **${f.filePath}**: ${f.findingCount} finding(s) [Severity: ${f.highestSeverity?.toUpperCase()}]`,
        )
        .join("\n")
}

## Key Dependencies & Interconnections
- **Total Cross-Module Imports:** ${importEdges.length}
- **Total Inter-Function Calls:** ${callEdges.length}

### Module Dependency Sample:
${importEdges
  .slice(0, 20)
  .map((e) => `- \`${e.source}\` ──▶ imports ──▶ \`${e.target}\``)
  .join("\n")}
${importEdges.length > 20 ? `\n*... and ${importEdges.length - 20} more import relationships.*` : ""}
`;

  return {
    filename: "architecture.md",
    type: "architecture",
    title: "Architecture & Component Topology",
    content,
    updatedAt,
  };
}

function generateSecurityFindingsDoc(
  findings: readonly Finding[],
  updatedAt: string,
): OkfDocument {
  if (findings.length === 0) {
    return {
      filename: "security-findings.md",
      type: "security-findings",
      title: "Security Findings & Taint Traces",
      content: "# Security Findings & Taint Traces\n\nNo security vulnerabilities detected in the current scan.",
      updatedAt,
    };
  }

  const sections = findings.map((f, idx) => {
    const traceSteps = f.trace?.steps ?? [];
    const traceStr =
      traceSteps.length > 0
        ? traceSteps
            .map(
              (s, i) =>
                `  ${i + 1}. [${s.role.toUpperCase()}] \`${s.label}\` at \`${s.filePath}:${s.line}\``,
            )
            .join("\n")
        : "  *Direct match without multi-step propagation.*";

    return `### Finding [${idx + 1}]: ${f.id} — ${f.title}
- **Rule ID:** \`${f.ruleId}\`
- **Severity:** ${f.severity.toUpperCase()}
- **Status:** ${f.status.toUpperCase()}
${f.cwe ? `- **CWE:** ${f.cwe}` : ""}
${f.link ? `- **Reference:** ${f.link}` : ""}
${f.code ? `\n**Vulnerable Code Snippet:**\n\`\`\`\n${f.code.trim()}\n\`\`\`\n` : ""}
**Taint Propagation Path:**
${traceStr}

${f.reason ? `**Security Explanation:**\n${f.reason}\n` : ""}
${f.hint ? `**Remediation Guidance:**\n${f.hint}\n` : ""}
${f.fix ? `**Safe Replacement:**\n\`\`\`\n${f.fix.trim()}\n\`\`\`\n` : ""}
---
`;
  });

  const content = `# Security Findings & Taint Traces

Total Active Findings: ${findings.length}

${sections.join("\n")}
`;

  return {
    filename: "security-findings.md",
    type: "security-findings",
    title: "Security Findings & Taint Traces",
    content,
    updatedAt,
  };
}

function generateServicesDoc(
  graph: WorkspaceGraph | undefined,
  updatedAt: string,
): OkfDocument {
  const functionNodes = graph?.nodes.filter((n) => n.type === "function") ?? [];
  const classNodes = graph?.nodes.filter((n) => n.type === "class") ?? [];

  const content = `# Services, Classes & Exported Symbols

- **Total Classes/Interfaces:** ${classNodes.length}
- **Total Functions/Methods:** ${functionNodes.length}

## Classes Sample
${
  classNodes.length === 0
    ? "No classes detected."
    : classNodes
        .slice(0, 25)
        .map((c) => `- \`${c.label}\` in \`${c.filePath}:${c.line ?? 1}\``)
        .join("\n")
}

## Functions Sample
${
  functionNodes.length === 0
    ? "No functions detected."
    : functionNodes
        .slice(0, 30)
        .map((fn) => `- \`${fn.label}()\` in \`${fn.filePath}:${fn.line ?? 1}\``)
        .join("\n")
}
`;

  return {
    filename: "services.md",
    type: "services",
    title: "Services & Symbol Hierarchy",
    content,
    updatedAt,
  };
}

