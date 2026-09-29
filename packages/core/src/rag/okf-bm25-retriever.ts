/**
 * Open Knowledge Format (OKF) & Okapi BM25 Search Engine
 *
 * Implements fielded BM25 ranking over structured OKF knowledge projections
 * (Architecture, Repository, Services, Security Findings) and active scan findings.
 *
 * Pure TypeScript, sub-millisecond execution (< 1ms).
 */

import type { Finding, WorkspaceGraph, OkfBundle, Severity } from "@whoami/types";
import { tokenizeText, type NluAnalysis } from "./nlu-analyzer.js";

export type OkfChunkType =
  | "finding"
  | "taint_trace"
  | "architecture"
  | "service"
  | "repository"
  | "file";

export interface IndexedChunk {
  readonly id: string;
  readonly type: OkfChunkType;
  readonly title: string;
  readonly content: string;
  readonly filePath?: string;
  readonly line?: number;
  readonly findingId?: string;
  readonly severity?: Severity;
  readonly tokenFreqs: Map<string, number>;
  readonly length: number;
  readonly staticBoost: number;
}

export interface ScoredOkfChunk {
  readonly chunk: IndexedChunk;
  readonly score: number;
}

export class OkfBm25Index {
  private readonly chunks: IndexedChunk[] = [];
  private readonly docFreqs: Map<string, number> = new Map();
  private avgDocLength = 0;
  private readonly k1: number;
  private readonly b: number;

  constructor(k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
  }

  addChunk(
    id: string,
    type: OkfChunkType,
    title: string,
    content: string,
    meta: {
      filePath?: string;
      line?: number;
      findingId?: string;
      severity?: Severity;
      staticBoost?: number;
    } = {},
  ): void {
    const rawTokens = tokenizeText(`${title} ${content} ${meta.filePath ?? ""} ${meta.findingId ?? ""}`);
    const tokenFreqs = new Map<string, number>();

    for (const t of rawTokens) {
      tokenFreqs.set(t, (tokenFreqs.get(t) ?? 0) + 1);
    }

    let staticBoost = meta.staticBoost ?? 1.0;
    if (meta.findingId) staticBoost *= 1.5;
    if (meta.severity === "critical") staticBoost *= 1.5;
    else if (meta.severity === "high") staticBoost *= 1.25;

    const chunk: IndexedChunk = {
      id,
      type,
      title,
      content,
      filePath: meta.filePath,
      line: meta.line,
      findingId: meta.findingId,
      severity: meta.severity,
      tokenFreqs,
      length: rawTokens.length,
      staticBoost,
    };

    this.chunks.push(chunk);

    for (const token of tokenFreqs.keys()) {
      this.docFreqs.set(token, (this.docFreqs.get(token) ?? 0) + 1);
    }
  }

  build(): void {
    if (this.chunks.length === 0) {
      this.avgDocLength = 0;
      return;
    }
    const totalLength = this.chunks.reduce((sum, c) => sum + c.length, 0);
    this.avgDocLength = totalLength / this.chunks.length;
  }

  search(nlu: NluAnalysis, topK = 5): ScoredOkfChunk[] {
    if (this.chunks.length === 0 || nlu.tokens.length === 0) {
      return [];
    }

    const N = this.chunks.length;
    const scoredChunks: ScoredOkfChunk[] = [];
    const queryFindingIds = new Set(nlu.slots.findingIds);
    const queryFilePaths = new Set(nlu.slots.filePaths);
    const queryCweIds = new Set(nlu.slots.cweIds);

    for (const chunk of this.chunks) {
      let bm25Score = 0;

      for (const token of nlu.tokens) {
        const tf = chunk.tokenFreqs.get(token) ?? 0;
        if (tf === 0) continue;

        const df = this.docFreqs.get(token) ?? 0;
        // Robertson-Spärck Jones IDF with smoothing
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));

        // Okapi length-normalized TF
        const lengthNorm = 1 - this.b + this.b * (chunk.length / (this.avgDocLength || 1));
        const normalizedTf = (tf * (this.k1 + 1)) / (tf + this.k1 * lengthNorm);

        bm25Score += idf * normalizedTf;
      }

      if (bm25Score <= 0) continue;

      let dynamicMultiplier = chunk.staticBoost;

      // Field Boost: Direct Finding ID match (5.0x)
      if (chunk.findingId && queryFindingIds.has(chunk.findingId.toUpperCase())) {
        dynamicMultiplier *= 5.0;
      }

      // Field Boost: File Path match (3.0x)
      if (chunk.filePath && queryFilePaths.has(chunk.filePath.toLowerCase())) {
        dynamicMultiplier *= 3.0;
      }

      // Field Boost: CWE ID match (2.0x)
      for (const cwe of queryCweIds) {
        if (chunk.title.toUpperCase().includes(cwe) || chunk.content.toUpperCase().includes(cwe)) {
          dynamicMultiplier *= 2.0;
          break;
        }
      }

      scoredChunks.push({
        chunk,
        score: bm25Score * dynamicMultiplier,
      });
    }

    return scoredChunks.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

/**
 * Builds an in-memory index from active scan findings, OKF bundle, and workspace graph.
 */
export function buildOkfBm25Index(
  findings: readonly Finding[] = [],
  graph?: WorkspaceGraph,
  okfBundle?: OkfBundle,
): OkfBm25Index {
  const index = new OkfBm25Index();

  // 1. Index Findings
  for (const f of findings) {
    const primaryFile = f.trace?.steps?.[0]?.filePath ?? "";
    const primaryLine = f.trace?.steps?.[0]?.line;
    const cweText = f.cwe ? ` CWE: ${f.cwe}` : "";
    const reasonText = f.reason ? ` Reason: ${f.reason}` : "";
    const hintText = f.hint ? ` Remediation: ${f.hint}` : "";
    const fixText = f.fix ? ` Fix: ${f.fix}` : "";

    index.addChunk(
      `finding:${f.id}`,
      "finding",
      `Finding ${f.id} — ${f.title}`,
      `${f.description}${cweText}${reasonText}${hintText}${fixText} File: ${primaryFile}`,
      {
        filePath: primaryFile,
        line: primaryLine,
        findingId: f.id,
        severity: f.severity,
      },
    );

    // Index Taint Step Trajectory
    if (f.trace?.steps && f.trace.steps.length > 1) {
      const stepTrace = f.trace.steps
        .map((s, idx) => `Step ${idx + 1} [${s.role}]: ${s.label} (${s.filePath}:${s.line})`)
        .join(" -> ");

      index.addChunk(
        `trace:${f.id}`,
        "taint_trace",
        `Taint Trace for ${f.id} (${f.trace.sinkClass})`,
        stepTrace,
        {
          filePath: primaryFile,
          findingId: f.id,
          severity: f.severity,
          staticBoost: 1.2,
        },
      );
    }
  }

  // 2. Index OKF Projections
  if (okfBundle) {
    index.addChunk(
      "okf:repository",
      "repository",
      okfBundle.repository.title,
      okfBundle.repository.content,
      { staticBoost: 1.0 },
    );
    index.addChunk(
      "okf:architecture",
      "architecture",
      okfBundle.architecture.title,
      okfBundle.architecture.content,
      { staticBoost: 1.1 },
    );
    index.addChunk(
      "okf:services",
      "service",
      okfBundle.services.title,
      okfBundle.services.content,
      { staticBoost: 1.1 },
    );
    index.addChunk(
      "okf:security-findings",
      "finding",
      okfBundle.securityFindings.title,
      okfBundle.securityFindings.content,
      { staticBoost: 1.2 },
    );
  }

  // 3. Index Workspace Graph nodes
  if (graph) {
    for (const node of graph.nodes) {
      if (node.type === "file") {
        const findingCount = node.findingCount ?? 0;
        index.addChunk(
          `file:${node.id}`,
          "file",
          `File Node: ${node.filePath}`,
          findingCount > 0
            ? `Vulnerabilities: ${findingCount} issues, Highest severity: ${node.highestSeverity ?? "none"}`
            : `Clean File: 0 vulnerabilities detected in ${node.filePath}`,
          {
            filePath: node.filePath,
            severity: node.highestSeverity,
            staticBoost: findingCount > 0 ? 1.0 : 0.9,
          },
        );
      }
    }
  }

  index.build();
  return index;
}

