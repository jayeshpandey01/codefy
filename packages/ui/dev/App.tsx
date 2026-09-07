// Canned fixtures standing in for a real scan
// yet to iterate against -- see CLAUDE.md's SQL-injection walkthrough
// (req.params.id -> getProfile() -> db.query(sql)).
const FIXTURES: readonly Finding[] = [
  {
    id: "finding-sql-injection",
    ruleId: "js-sql-injection-string-concat",
    status: "confirmed",
    severity: "critical",
    title: "SQL injection via unsanitized request parameter",
    description:
      "req.params.id flows unmodified into a raw SQL string with no sanitizer anywhere on the path.",
    cwe: "CWE-89",
    createdAt: "2026-08-30T12:00:00.000Z",
    trace: {
      sinkClass: "sql-injection",
      steps: [
        {
          role: "source",
          label: "req.params.id",
          filePath: "src/routes/profile.ts",
          line: 4,
        },
        {
          role: "passthrough",
          label: "getProfile(id)",
          filePath: "src/services/profile.ts",
          line: 12,
        },
        {
          role: "sink",
          label: "db.query(sql)",
          filePath: "src/db/client.ts",
          line: 30,
        },
      ],
    },
  },
  {
    id: "finding-command-injection",
    ruleId: "js-command-injection-exec",
    status: "needs-verification",
    severity: "high",
    title: "Possible command injection via uploaded filename",
    description:
      "req.body.filename reaches exec() through a helper whose sanitization could not be resolved deterministically.",
    cwe: "CWE-78",
    createdAt: "2026-08-30T12:05:00.000Z",
    trace: {
      sinkClass: "command-injection",
      steps: [
        {
          role: "source",
          label: "req.body.filename",
          filePath: "src/routes/upload.ts",
          line: 18,
        },
        {
          role: "sanitizer",
          label: "sanitizeMaybe(name)",
          filePath: "src/lib/sanitize.ts",
          line: 7,
        },
        {
          role: "sink",
          label: "exec(cmd)",
          filePath: "src/lib/convert.ts",
          line: 22,
        },
      ],
    },
  },
  {
    id: "finding-ssrf-discarded",
    ruleId: "js-ssrf-unvalidated-url",
    status: "discarded",
    severity: "medium",
    title: "URL fetch guarded by an allowlist",
    description:
      "req.query.url is checked against a known-safe allowlist before being fetched.",
    createdAt: "2026-08-30T12:10:00.000Z",
    trace: {
      sinkClass: "ssrf",
      steps: [
        {
          role: "source",
          label: "req.query.url",
          filePath: "src/routes/preview.ts",
          line: 9,
        },
        {
          role: "sanitizer",
          label: "assertAllowlisted(url)",
          filePath: "src/lib/allowlist.ts",
          line: 14,
        },
        {
          role: "sink",
          label: "fetch(url)",
          filePath: "src/services/preview.ts",
          line: 26,
        },
      ],
    },
  },
];

import { useMemo, useState, type ReactElement } from "react";
import type { BridgeMessage, Finding, WorkspaceGraph } from "@whoami/types";
import { FindingList } from "../src/components/FindingList.js";
import { GraphContainer } from "../src/visualization/GraphContainer.js";
import { UnifiedInterconnectedGraphView } from "../src/visualization/UnifiedInterconnectedGraphView.js";
import { BlastRadiusGraphView } from "../src/visualization/BlastRadiusGraphView.js";
import { ControlFlowGraphView } from "../src/visualization/ControlFlowGraphView.js";
import { DependencySupplyChainGraphView } from "../src/visualization/DependencySupplyChainGraphView.js";
import { RemoteAttackSurfaceGraphView } from "../src/visualization/RemoteAttackSurfaceGraphView.js";
import { BridgeProvider } from "../src/bridge/BridgeContext.js";
import { MockBridgeClient } from "../src/bridge/MockBridgeClient.js";

const MOCK_WORKSPACE_GRAPH: WorkspaceGraph = {
  nodes: [
    { id: "dir:src", label: "src", type: "directory", filePath: "src" },
    { id: "file:src/routes/profile.ts", label: "profile.ts", type: "file", filePath: "src/routes/profile.ts" },
    { id: "file:src/services/profile.ts", label: "profile.ts", type: "file", filePath: "src/services/profile.ts" },
    { id: "file:src/db/client.ts", label: "client.ts", type: "file", filePath: "src/db/client.ts" },
    { id: "func:getProfile", label: "getProfile(id)", type: "function", filePath: "src/services/profile.ts", line: 12 },
    { id: "func:query", label: "query(sql)", type: "function", filePath: "src/db/client.ts", line: 30 },
  ],
  edges: [
    { id: "e1", source: "dir:src", target: "file:src/routes/profile.ts", type: "contains" },
    { id: "e2", source: "file:src/services/profile.ts", target: "func:getProfile", type: "defines" },
    { id: "e3", source: "file:src/db/client.ts", target: "func:query", type: "defines" },
    { id: "e4", source: "func:getProfile", target: "func:query", type: "calls" },
  ],
};

export function App(): ReactElement {
  const bridge = useMemo(
    () =>
      new MockBridgeClient({
        responder: (message: BridgeMessage): BridgeMessage | undefined => {
          if (message.type === "run-poc-request") {
            return {
              type: "run-poc-result",
              requestId: message.requestId,
              verified: true,
              detail:
                "Local PoC probe succeeded (mock -- verified probe signature).",
            };
          }
          if (message.type === "jump-to-line") {
            // eslint-disable-next-line no-console
            console.log(
              `[dev playground] jump-to-line -> ${message.filePath}:${message.line}`,
            );
          }
          if (message.type === "apply-fix-request") {
            return {
              type: "apply-fix-result",
              requestId: message.requestId,
              applied: true,
            };
          }
          return undefined;
        },
      }),
    [],
  );

  const [selectedId, setSelectedId] = useState<string>(FIXTURES[0]!.id);
  const [sectionMode, setSectionMode] = useState<"local" | "orchestrator">("local");
  const [viewMode, setViewMode] = useState<
    "all" | "selected" | "unified" | "blast_radius" | "control_flow" | "supply_chain" | "remote"
  >("all");
  const [direction, setDirection] = useState<"DOWN" | "RIGHT">("DOWN");
  const [groupByFile, setGroupByFile] = useState<boolean>(true);

  const selected =
    FIXTURES.find((finding) => finding.id === selectedId) ?? FIXTURES[0]!;

  return (
    <BridgeProvider client={bridge}>
      <div className="grid h-screen grid-cols-[380px_1fr] gap-4 bg-[#1E1E1E] p-4 text-[#D4D4D4] font-sans">
        <div className="flex flex-col h-full overflow-hidden">
          <h1 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[#75BEFF]">
            Findings ({FIXTURES.length})
          </h1>

          {/* Section Mode Switcher (Local vs Orchestrator) */}
          <div className="flex items-center gap-1 mb-2 bg-[#252526] p-1 rounded border border-[#3C3C3C]">
            <button
              type="button"
              onClick={() => {
                setSectionMode("local");
                if (viewMode === "remote") setViewMode("all");
              }}
              className={`flex-1 py-1 text-xs font-semibold rounded cursor-pointer transition ${
                sectionMode === "local"
                  ? "bg-[#0E639C] text-white"
                  : "text-[#858585] hover:text-[#D4D4D4]"
              }`}
            >
              Local Section
            </button>
            <button
              type="button"
              onClick={() => {
                setSectionMode("orchestrator");
                setViewMode("remote");
              }}
              className={`flex-1 py-1 text-xs font-semibold rounded cursor-pointer transition ${
                sectionMode === "orchestrator"
                  ? "bg-[#0E639C] text-white"
                  : "text-[#858585] hover:text-[#D4D4D4]"
              }`}
            >
              Orchestrator Section
            </button>
          </div>

          {/* Diagram Type Selector (Filtered by Section) */}
          <div className="mb-3 flex flex-col gap-1.5 bg-[#252526] p-2 rounded-lg border border-[#3C3C3C]">
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#858585]">
              {sectionMode === "orchestrator"
                ? "Orchestrator Recon Diagrams"
                : "Local Analysis Diagrams"}
            </label>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as any)}
              className="rounded border border-[#3C3C3C] bg-[#1E1E1E] px-2 py-1 text-xs text-[#E0E0E0] outline-none cursor-pointer"
            >
              {sectionMode === "local" ? (
                <>
                  <option value="all">Data Flow DAG (All Findings)</option>
                  <option value="unified">Unified Architecture + Taint</option>
                  <option value="control_flow">Control Flow & Decision Gate</option>
                  <option value="supply_chain">Supply Chain & Dependencies</option>
                  <option value="blast_radius">Threat Model & Blast Radius</option>
                  <option value="selected">Selected Single Trace Flow</option>
                </>
              ) : (
                <>
                  <option value="remote">Remote Attack Surface Topology</option>
                  <option value="blast_radius">Threat Model & Blast Radius</option>
                </>
              )}
            </select>
          </div>

          <div className="flex items-center justify-between gap-2 mb-3 text-xs">
            <label className="flex items-center gap-1.5 text-[#858585] cursor-pointer">
              <input
                type="checkbox"
                checked={groupByFile}
                onChange={(e) => setGroupByFile(e.target.checked)}
                className="rounded border-[#3C3C3C]"
              />
              <span>Group by File</span>
            </label>

            <button
              type="button"
              onClick={() => setDirection((d) => (d === "DOWN" ? "RIGHT" : "DOWN"))}
              className="rounded border border-[#3C3C3C] bg-[#252526] hover:bg-[#2F2F30] px-2 py-0.5 text-[11px] text-[#D4D4D4] cursor-pointer"
            >
              {direction === "DOWN" ? "Top-to-Bottom" : "Left-to-Right"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            <FindingList
              findings={FIXTURES}
              onSelect={(finding) => {
                setSelectedId(finding.id);
                if (viewMode === "selected" || viewMode === "control_flow") {
                  // Keep active view mode
                }
              }}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-[#303031] bg-[#1E1E1E]">
          {viewMode === "all" && (
            <GraphContainer
              findings={FIXTURES}
              direction={direction}
              groupByFile={groupByFile}
            />
          )}

          {viewMode === "selected" && (
            <GraphContainer
              trace={selected.trace}
              direction={direction}
              groupByFile={groupByFile}
            />
          )}

          {viewMode === "unified" && (
            <UnifiedInterconnectedGraphView
              workspaceGraph={MOCK_WORKSPACE_GRAPH}
              findings={FIXTURES}
              direction={direction}
            />
          )}

          {viewMode === "blast_radius" && (
            <BlastRadiusGraphView
              findings={FIXTURES}
              workspaceGraph={MOCK_WORKSPACE_GRAPH}
              direction={direction}
            />
          )}

          {viewMode === "control_flow" && (
            <ControlFlowGraphView
              finding={selected}
              findings={FIXTURES}
              direction={direction}
            />
          )}

          {viewMode === "supply_chain" && (
            <DependencySupplyChainGraphView
              workspaceGraph={MOCK_WORKSPACE_GRAPH}
              findings={FIXTURES}
              direction={direction}
            />
          )}

          {viewMode === "remote" && (
            <RemoteAttackSurfaceGraphView
              findings={FIXTURES}
              direction={direction}
            />
          )}
        </div>
      </div>
    </BridgeProvider>
  );
}
