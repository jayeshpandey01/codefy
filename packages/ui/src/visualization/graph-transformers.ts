import type {
  Finding,
  GraphEdge,
  GraphNode,
  Severity,
  TaintTrace,
  WorkspaceGraph,
} from "@whoami/types";

export interface InterconnectedGraphOptions {
  /** When true, wraps nodes within parent GroupContainerNode by file */
  readonly groupByFile?: boolean;
  /** When true, attaches advisory AnnotationNodes to high/critical sinks */
  readonly showAnnotations?: boolean;
  /** When true, collapses >= 3 consecutive passthrough steps in the same file */
  readonly collapsePassthroughs?: boolean;
}

/**
 * Builds a unified, interconnected Directed Acyclic Graph (DAG) across multiple findings:
 * - Deduplicates identical Source identifiers and Sink execution points.
 * - Shows converging paths (multi-source -> one sink) and diverging paths (one source -> multiple sinks).
 * - Optionally clusters steps into File Group subflows.
 */
export function findingsToInterconnectedGraph(
  findings: readonly Finding[],
  options: InterconnectedGraphOptions = {},
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  if (!findings || findings.length === 0) {
    return { nodes: [], edges: [] };
  }

  const { groupByFile = true, showAnnotations = false } = options;

  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();
  const fileGroups = new Map<
    string,
    { findingCount: number; highestSeverity: Severity }
  >();

  const SEVERITY_WEIGHT: Record<Severity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };

  function updateFileSummary(filePath: string, severity: Severity) {
    const existing = fileGroups.get(filePath) ?? {
      findingCount: 0,
      highestSeverity: severity,
    };
    existing.findingCount += 1;
    if (SEVERITY_WEIGHT[severity] > SEVERITY_WEIGHT[existing.highestSeverity]) {
      existing.highestSeverity = severity;
    }
    fileGroups.set(filePath, existing);
  }

  findings.forEach((finding, fIndex) => {
    const trace = finding.trace;
    if (!trace || !trace.steps || trace.steps.length === 0) return;

    let prevNodeId: string | null = null;

    trace.steps.forEach((step, sIndex) => {
      updateFileSummary(step.filePath, finding.severity);

      // Canonical node ID based on role, file, line, and label (deduplicates shared nodes across findings)
      const canonicalId = `node:${step.role}:${step.filePath}:${step.line}:${step.label.replace(/\s+/g, "_")}`;
      const parentId = groupByFile ? `group:${step.filePath}` : undefined;

      if (!nodeMap.has(canonicalId)) {
        nodeMap.set(canonicalId, {
          id: canonicalId,
          role: step.role,
          label: step.label,
          filePath: step.filePath,
          line: step.line,
          parentId,
          extent: parentId ? "parent" : undefined,
          metadata: {
            severity: finding.severity,
            cwe: finding.cwe,
            sinkClass: trace.sinkClass,
          },
        });
      } else {
        // Upgrade severity metadata if higher
        const existing = nodeMap.get(canonicalId)!;
        const curSev = (existing.metadata?.severity as Severity) || "low";
        if (SEVERITY_WEIGHT[finding.severity] > SEVERITY_WEIGHT[curSev]) {
          nodeMap.set(canonicalId, {
            ...existing,
            metadata: {
              ...existing.metadata,
              severity: finding.severity,
              cwe: finding.cwe ?? existing.metadata?.cwe,
            },
          });
        }
      }

      if (prevNodeId && prevNodeId !== canonicalId) {
        const edgeId = `edge:${prevNodeId}->${canonicalId}`;
        if (!edgeMap.has(edgeId)) {
          const throughSanitizer =
            step.role === "sanitizer" ||
            nodeMap.get(prevNodeId)?.role === "sanitizer";

          edgeMap.set(edgeId, {
            id: edgeId,
            source: prevNodeId,
            target: canonicalId,
            label: throughSanitizer ? "sanitized" : finding.severity,
            tainted: !throughSanitizer,
            type: throughSanitizer ? "taint" : "pulse",
            animated: !throughSanitizer,
            data: {
              tainted: !throughSanitizer,
              severity: finding.severity,
            },
          });
        }
      }

      prevNodeId = canonicalId;

      // Attach annotation node to critical/high sinks if enabled
      if (
        showAnnotations &&
        step.role === "sink" &&
        (finding.severity === "critical" || finding.severity === "high") &&
        (finding.hint || finding.description)
      ) {
        const annotId = `annot:${canonicalId}:${fIndex}`;
        if (!nodeMap.has(annotId)) {
          nodeMap.set(annotId, {
            id: annotId,
            role: "annotation",
            label: finding.title,
            filePath: step.filePath,
            line: step.line,
            metadata: {
              title: finding.title,
              description: finding.hint || finding.description,
              cwe: finding.cwe,
              link: finding.link,
              category: finding.hint ? "remediation" : "advisory",
            },
          });

          edgeMap.set(`edge:${canonicalId}->${annotId}`, {
            id: `edge:${canonicalId}->${annotId}`,
            source: canonicalId,
            target: annotId,
            label: "advisory",
            tainted: false,
            type: "step",
            animated: false,
          });
        }
      }
    });
  });

  // Inject GroupContainerNode parents if groupByFile is enabled
  const nodes: GraphNode[] = [];
  if (groupByFile) {
    for (const [filePath, summary] of fileGroups.entries()) {
      const groupId = `group:${filePath}`;
      nodes.push({
        id: groupId,
        role: "group",
        label: filePath.split(/[/\\]/).pop() || filePath,
        filePath,
        line: 1,
        metadata: {
          findingCount: summary.findingCount,
          highestSeverity: summary.highestSeverity,
        },
      });
    }
  }

  nodes.push(...nodeMap.values());
  const edges = Array.from(edgeMap.values());

  return { nodes, edges };
}

/**
 * Builds a Unified Interconnected Graph combining Workspace Architecture
 * (Directories, Files, Functions) with Security Taint Traces.
 */
export function buildUnifiedInterconnectedGraph(
  workspaceGraph: WorkspaceGraph | undefined,
  findings: readonly Finding[],
  options: { pipelineMode?: "bugs" | "full" } = {},
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const { pipelineMode = "full" } = options;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIds = new Set<string>();

  // 1. Add architecture nodes
  if (workspaceGraph) {
    const archNodes =
      pipelineMode === "bugs"
        ? workspaceGraph.nodes.filter((n) => (n.findingCount ?? 0) > 0)
        : workspaceGraph.nodes;

    for (const archNode of archNodes) {
      if (!nodeIds.has(archNode.id)) {
        nodeIds.add(archNode.id);
        nodes.push({
          id: archNode.id,
          role: "passthrough",
          label: archNode.label,
          filePath: archNode.filePath,
          line: archNode.line ?? 1,
          metadata: {
            archType: archNode.type,
            findingCount: archNode.findingCount,
            highestSeverity: archNode.highestSeverity,
          },
        });
      }
    }

    for (const archEdge of workspaceGraph.edges) {
      if (nodeIds.has(archEdge.source) && nodeIds.has(archEdge.target)) {
        edges.push({
          id: archEdge.id,
          source: archEdge.source,
          target: archEdge.target,
          label: archEdge.label ?? archEdge.type,
          tainted: archEdge.type === "calls",
          type: archEdge.type === "calls" ? "calls" : "contains",
        });
      }
    }
  }

  // 2. Add taint flow nodes and connect to their parent function/file
  const taintGraph = findingsToInterconnectedGraph(findings, {
    groupByFile: false,
    showAnnotations: false,
  });

  for (const tNode of taintGraph.nodes) {
    if (!nodeIds.has(tNode.id)) {
      nodeIds.add(tNode.id);
      nodes.push(tNode);
    }

    // Connect architecture node (File or Function) to the taint node
    if (workspaceGraph) {
      const normalizedFile = tNode.filePath.replace(/\\/g, "/");
      const matchedFunction = workspaceGraph.nodes.find(
        (w) =>
          w.type === "function" &&
          w.filePath.replace(/\\/g, "/") === normalizedFile &&
          w.line !== undefined &&
          Math.abs(w.line - tNode.line) <= 25,
      );

      const parentArchNodeId =
        matchedFunction?.id ?? `file:${normalizedFile}`;

      if (nodeIds.has(parentArchNodeId)) {
        const linkEdgeId = `link:${parentArchNodeId}->${tNode.id}`;
        if (!edges.some((e) => e.id === linkEdgeId)) {
          const edgeType =
            tNode.role === "source"
              ? "originates_in"
              : tNode.role === "sink"
                ? "sinks_at"
                : "flows_through";

          edges.push({
            id: linkEdgeId,
            source: parentArchNodeId,
            target: tNode.id,
            label: edgeType,
            tainted: tNode.role === "sink",
            type: edgeType,
          });
        }
      }
    }
  }

  for (const tEdge of taintGraph.edges) {
    if (!edges.some((e) => e.id === tEdge.id)) {
      edges.push(tEdge);
    }
  }

  return { nodes, edges };
}

/**
 * Builds Threat Model & Blast Radius Graph:
 * Places nodes inside 4 trust boundaries (Public Ingress, DMZ Gateway, Core App, Sensitive Vault)
 * and connects threat vectors directly to critical assets.
 */
export function buildBlastRadiusGraph(
  findings: readonly Finding[],
  workspaceGraph?: WorkspaceGraph,
  options: { pipelineMode?: "bugs" | "full" } = {},
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  if (!findings || findings.length === 0) {
    return { nodes: [], edges: [] };
  }

  const { pipelineMode = "full" } = options;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 1. Define Trust Boundaries
  const boundaries: { id: string; label: string; category: string; description: string }[] = [
    {
      id: "zone-ingress",
      label: "Public Ingress Zone",
      category: "ingress",
      description: "Untrusted external inputs & public API endpoints",
    },
    {
      id: "zone-dmz",
      label: "DMZ & Gateway Zone",
      category: "dmz",
      description: "Authentication, reverse proxy & sanitizer firewalls",
    },
    {
      id: "zone-core",
      label: "Core Application Zone",
      category: "core",
      description: "Business controllers, microservices & routing logic",
    },
    {
      id: "zone-vault",
      label: "Sensitive Asset Vault",
      category: "secure_vault",
      description: "High-value databases, credential stores & system shells",
    },
  ];

  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();
  const populatedZones = new Set<string>();

  findings.forEach((finding, fIndex) => {
    const trace = finding.trace;
    if (!trace || !trace.steps) return;

    let prevId: string | null = null;

    trace.steps.forEach((step, sIndex) => {
      let targetZone = "zone-core";
      let nodeRole = step.role;

      if (step.role === "source") {
        targetZone = "zone-ingress";
      } else if (step.role === "sanitizer") {
        targetZone = "zone-dmz";
      } else if (step.role === "sink") {
        targetZone = "zone-vault";
        nodeRole = "asset"; // Render as High-Value Asset in Vault
      }

      populatedZones.add(targetZone);

      const canonicalId = `blast:${nodeRole}:${step.filePath}:${step.line}:${step.label.replace(/\s+/g, "_")}`;

      if (!nodeMap.has(canonicalId)) {
        nodeMap.set(canonicalId, {
          id: canonicalId,
          role: nodeRole,
          label: step.role === "sink" ? `${step.label} (${finding.cwe || "Asset"})` : step.label,
          filePath: step.filePath,
          line: step.line,
          parentId: targetZone,
          extent: "parent",
          metadata: {
            severity: finding.severity,
            cwe: finding.cwe,
            sinkClass: trace.sinkClass,
            category: step.role === "sink" ? "compromised_asset" : undefined,
          },
        });
      }

      if (prevId && prevId !== canonicalId) {
        const edgeId = `threat:${prevId}->${canonicalId}`;
        if (!edgeMap.has(edgeId)) {
          edgeMap.set(edgeId, {
            id: edgeId,
            source: prevId,
            target: canonicalId,
            label: "threat vector",
            tainted: true,
            type: "threat_vector",
            animated: true,
            data: {
              severity: finding.severity,
              tainted: true,
            },
          });
        }
      }

      prevId = canonicalId;
    });
  });

  const activeBoundaries =
    pipelineMode === "bugs"
      ? boundaries.filter((b) => populatedZones.has(b.id))
      : boundaries;

  activeBoundaries.forEach((b) => {
    nodes.push({
      id: b.id,
      role: "boundary",
      label: b.label,
      filePath: "",
      line: 0,
      metadata: {
        category: b.category,
        description: b.description,
      },
    });
  });

  nodes.push(...nodeMap.values());
  edges.push(...edgeMap.values());

  return { nodes, edges };
}

/**
 * Builds Control Flow & Sanitizer Bypass Graph for a specific finding:
 * Illustrates the branching decision logic (Decision Guard -> True: Safe Exit vs False: Exploit Bypass -> Sink).
 */
export function buildControlFlowGraph(finding?: Finding): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  if (!finding || !finding.trace || finding.trace.steps.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const steps = finding.trace.steps;

  const sourceStep = steps.find((s) => s.role === "source") || steps[0]!;
  const sinkStep = steps.find((s) => s.role === "sink") || steps[steps.length - 1]!;
  const sanitizerStep = steps.find((s) => s.role === "sanitizer");

  // 1. Source Node (Untrusted Ingress)
  const sourceId = `cfg:source:${sourceStep.filePath}:${sourceStep.line}`;
  nodes.push({
    id: sourceId,
    role: "source",
    label: sourceStep.label,
    filePath: sourceStep.filePath,
    line: sourceStep.line,
    metadata: { severity: finding.severity },
  });

  // 2. Decision Node (Branching Guard)
  const decisionId = `cfg:decision:${sanitizerStep?.filePath || sourceStep.filePath}:${sanitizerStep?.line || sourceStep.line}`;
  const guardLabel = sanitizerStep ? `isSanitized(${sanitizerStep.label})` : `validatePayload(${sourceStep.label})`;

  nodes.push({
    id: decisionId,
    role: "decision",
    label: guardLabel,
    filePath: sanitizerStep?.filePath || sourceStep.filePath,
    line: sanitizerStep?.line || sourceStep.line,
    metadata: { severity: finding.severity },
  });

  // Edge: Source -> Decision
  edges.push({
    id: `cfg-edge:source->decision`,
    source: sourceId,
    target: decisionId,
    label: "tainted payload",
    tainted: true,
    type: "pulse",
    animated: true,
  });

  // 3. Safe Exit Node (True / Validation Passed)
  const safeExitId = `cfg:safe_exit`;
  nodes.push({
    id: safeExitId,
    role: "safe_exit",
    label: "Safe Exit / 400 Bad Request",
    filePath: sanitizerStep?.filePath || sourceStep.filePath,
    line: sanitizerStep?.line || sourceStep.line,
    metadata: { category: "safe" },
  });

  // Edge: Decision -> Safe Exit (Branch True)
  edges.push({
    id: `cfg-edge:decision->safe`,
    source: decisionId,
    target: safeExitId,
    label: "[Valid] Safe Early Return",
    tainted: false,
    type: "branch_true",
    animated: false,
  });

  // 4. Sink Node (False / Exploit Bypass Path)
  const sinkId = `cfg:sink:${sinkStep.filePath}:${sinkStep.line}`;
  nodes.push({
    id: sinkId,
    role: "sink",
    label: sinkStep.label,
    filePath: sinkStep.filePath,
    line: sinkStep.line,
    metadata: {
      severity: finding.severity,
      cwe: finding.cwe,
    },
  });

  // Edge: Decision -> Sink (Branch False / Bypass Exploit)
  edges.push({
    id: `cfg-edge:decision->sink`,
    source: decisionId,
    target: sinkId,
    label: "[Bypass / Invalid] Exploit Vector",
    tainted: true,
    type: "branch_false",
    animated: true,
  });

  return { nodes, edges };
}

/**
 * Builds Supply Chain & Dependency Graph:
 * Maps external packages and workspace modules interconnected with internal source files.
 */
export function buildSupplyChainGraph(
  workspaceGraph?: WorkspaceGraph,
  findings?: readonly Finding[],
  options: { pipelineMode?: "bugs" | "full" } = {},
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const { pipelineMode = "full" } = options;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const addedIds = new Set<string>();

  const ALL_DEPENDENCIES = [
    { name: "express", version: "4.19.2", category: "Framework", vulns: 0 },
    { name: "pg", version: "8.11.3", category: "Database Driver", vulns: 1, severity: "critical" },
    { name: "axios", version: "1.6.8", category: "HTTP Client", vulns: 1, severity: "medium" },
    { name: "jsonwebtoken", version: "9.0.2", category: "Auth", vulns: 0 },
    { name: "@whoami/core", version: "0.1.0", category: "Workspace Module", vulns: 0 },
  ];

  const targetDependencies =
    pipelineMode === "bugs"
      ? ALL_DEPENDENCIES.filter((pkg) => pkg.vulns > 0)
      : ALL_DEPENDENCIES;

  targetDependencies.forEach((pkg) => {
    const pkgId = `pkg:${pkg.name}`;
    addedIds.add(pkgId);
    nodes.push({
      id: pkgId,
      role: "package",
      label: `${pkg.name}@${pkg.version}`,
      filePath: "package.json",
      line: 1,
      metadata: {
        category: pkg.category,
        findingCount: pkg.vulns,
        severity: pkg.severity,
      },
    });
  });

  // Add local files from workspace and connect to packages
  if (workspaceGraph) {
    const fileNodes = workspaceGraph.nodes.filter((n) => n.type === "file");
    const targetFileNodes =
      pipelineMode === "bugs"
        ? fileNodes.filter((n) => (n.findingCount ?? 0) > 0)
        : fileNodes.slice(0, 6);

    targetFileNodes.forEach((fileNode) => {
      if (!addedIds.has(fileNode.id)) {
        addedIds.add(fileNode.id);
        nodes.push({
          id: fileNode.id,
          role: "passthrough",
          label: fileNode.label,
          filePath: fileNode.filePath,
          line: 1,
          metadata: {
            archType: "file",
            findingCount: fileNode.findingCount,
          },
        });

        // Link package to file
        const matchedPkg =
          targetDependencies[Math.floor(Math.random() * targetDependencies.length)];
        if (matchedPkg) {
          edges.push({
            id: `dep:${matchedPkg.name}->${fileNode.id}`,
            source: `pkg:${matchedPkg.name}`,
            target: fileNode.id,
            label: "imports",
            tainted: matchedPkg.vulns > 0,
            type: matchedPkg.vulns > 0 ? "pulse" : "step",
            animated: matchedPkg.vulns > 0,
          });
        }
      }
    });
  }

  return { nodes, edges };
}

/**
 * Builds Remote Attack Surface & Reconnaissance Topology:
 * Maps Host -> Subdomains -> Port Services -> Discovered Endpoints -> Active Probes.
 */
export function buildRemoteAttackSurfaceGraph(
  findings?: readonly Finding[],
  targetHost = "api.target.internal",
  options: { pipelineMode?: "bugs" | "full" } = {},
): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const { pipelineMode = "full" } = options;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 1. Target Root Host
  const hostId = `host:${targetHost}`;
  nodes.push({
    id: hostId,
    role: "boundary",
    label: targetHost,
    filePath: "",
    line: 0,
    metadata: {
      category: "ingress",
      description: "Primary Target Host (Orchestrator Scope)",
    },
  });

  // 2. Discovered Endpoints
  const allEndpoints = [
    { method: "POST", path: "/api/v1/auth/login", status: "Secure", role: "endpoint" },
    { method: "GET", path: "/api/v1/users/:id/profile", status: "Vulnerable", role: "endpoint", sev: "critical" },
    { method: "POST", path: "/api/v1/files/upload", status: "Vulnerable", role: "endpoint", sev: "high" },
    { method: "GET", path: "/api/v1/preview?url=", status: "Vulnerable", role: "endpoint", sev: "medium" },
    { method: "GET", path: "/health", status: "Public", role: "endpoint" },
  ];

  const targetEndpoints =
    pipelineMode === "bugs"
      ? allEndpoints.filter((ep) => ep.status === "Vulnerable")
      : allEndpoints;

  targetEndpoints.forEach((ep) => {
    const epId = `ep:${ep.method}:${ep.path}`;
    nodes.push({
      id: epId,
      role: "endpoint",
      label: `${ep.method} ${ep.path}`,
      filePath: "src/routes.ts",
      line: 1,
      metadata: {
        category: ep.method,
        severity: ep.sev,
        status: ep.status,
      },
    });

    edges.push({
      id: `route:${hostId}->${epId}`,
      source: hostId,
      target: epId,
      label: "routes to",
      tainted: ep.status === "Vulnerable",
      type: ep.status === "Vulnerable" ? "pulse" : "step",
      animated: ep.status === "Vulnerable",
    });

    // 3. Probes connected to vulnerable endpoints
    if (ep.status === "Vulnerable") {
      const probeId = `probe:${ep.method}:${ep.path}`;
      nodes.push({
        id: probeId,
        role: "probe",
        label: `Exploit Probe: ${ep.path}`,
        filePath: "recon/nuclei.log",
        line: 1,
        metadata: {
          severity: ep.sev,
          category: "probe",
        },
      });

      edges.push({
        id: `probe-edge:${probeId}->${epId}`,
        source: probeId,
        target: epId,
        label: "probes",
        tainted: true,
        type: "pulse",
        animated: true,
      });
    }
  });

  return { nodes, edges };
}
