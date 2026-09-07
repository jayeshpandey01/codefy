import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
} from "react";
import type {
  AllScanProfile,
  BridgeMessage,
  ChatGraphViewMode,
  Finding,
  SastProfile,
  ScanProfile,
  WorkspaceGraph,
} from "@whoami/types";
import {
  ChatPanel,
  FloatingDetailCard,
  GraphContainer,
  IssueTreeSidebar,
  UnifiedScanHeader,
  type ChatTurn,
  type ScanMode,
  convertScanResultToFindings,
  useBridge,
  UnifiedInterconnectedGraphView,
  BlastRadiusGraphView,
  ControlFlowGraphView,
  DependencySupplyChainGraphView,
  RemoteAttackSurfaceGraphView,
  ResizableSplitter,
  ScrollableTabsBar,
  DiamondIcon,
  FileCodeIcon,
  RadioIcon,
  RemoteScanIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  XIcon,
} from "@whoami/ui";
import { runChatQuery } from "@whoami/core/query";

type ScanStatus = "idle" | "scanning" | "error";
type MainTabId =
  | "graph"
  | "unified"
  | "blast_radius"
  | "control_flow"
  | "supply_chain"
  | "remote";
type GraphViewMode = "all" | "selected";

const ALL_TABS: Record<
  MainTabId,
  { id: MainTabId; label: string; icon: React.ReactNode }
> = {
  graph: {
    id: "graph",
    label: "DATA FLOW DAG",
    icon: <ShieldCheckIcon size={13} className="text-[#75BEFF] shrink-0" />,
  },
  unified: {
    id: "unified",
    label: "UNIFIED ARCHITECTURE + TAINT",
    icon: <RadioIcon size={13} className="text-[#4EC9B0] shrink-0" />,
  },
  blast_radius: {
    id: "blast_radius",
    label: "THREAT MODEL & BLAST RADIUS",
    icon: <ShieldAlertIcon size={13} className="text-[#F14C4C] shrink-0" />,
  },
  control_flow: {
    id: "control_flow",
    label: "CONTROL FLOW & DECISION GATES",
    icon: <DiamondIcon size={13} className="text-[#FFD700] shrink-0" />,
  },
  supply_chain: {
    id: "supply_chain",
    label: "SUPPLY CHAIN & DEPENDENCIES",
    icon: <FileCodeIcon size={13} className="text-[#4EC9B0] shrink-0" />,
  },
  remote: {
    id: "remote",
    label: "REMOTE ATTACK SURFACE",
    icon: <RemoteScanIcon size={13} className="text-[#89D185] shrink-0" />,
  },
};

/**
 * Desktop app shell with official VS Code Dark Modern theme and dynamic tab management.
 */
export function App(): ReactElement {
  const bridge = useBridge();

  const [openTabs, setOpenTabs] = useState<MainTabId[]>(["graph"]);
  const [activeTab, setActiveTab] = useState<MainTabId | null>("graph");
  const [graphViewMode, setGraphViewMode] = useState<GraphViewMode>("all");
  const [layoutDirection, setLayoutDirection] = useState<"DOWN" | "RIGHT">("DOWN");
  const [scanMode, setScanMode] = useState<ScanMode>("local-offline");
  const [analysisPipelineMode, setAnalysisPipelineMode] = useState<"bugs" | "full">("bugs");

  const [findings, setFindings] = useState<Finding[]>([]);
  const [workspaceGraph, setWorkspaceGraph] = useState<WorkspaceGraph | undefined>(undefined);
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([]);
  const [selectedFinding, setSelectedFinding] = useState<Finding | undefined>(undefined);
  const [showFloatingDetail, setShowFloatingDetail] = useState<boolean>(false);
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState<{
    scanned: number;
    total: number;
  } | null>(null);
  const [isOrchestratorScanning, setIsOrchestratorScanning] = useState<boolean>(false);
  const [orchestratorProgress, setOrchestratorProgress] = useState<{
    currentTask: string;
    completed: number;
    total: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>(() => {
    try {
      return localStorage.getItem("whoami:last_folder") || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    const offProgress = bridge.on("scan-workspace-progress", (message) => {
      setProgress({ scanned: message.scanned, total: message.total });
    });

    const offResult = bridge.on("scan-workspace-result", (message) => {
      const nextFindings = [...message.findings];
      setFindings(nextFindings);
      if (nextFindings.length > 0) {
        setSelectedFinding(nextFindings[0]);
        setShowFloatingDetail(true);
      }
      setStatus("idle");
      setProgress(null);

      // Refresh the workspace graph on scan completion — needed by the
      // supply-chain/unified/blast-radius views and by the chat panel's
      // LIST_FILES_WITH_FINDINGS query (see docs/CHAT-QUERY-ENGINE-SPEC.md §B.6).
      bridge.send({
        type: "get-workspace-graph-request",
        requestId: `desktop-graph-${Date.now()}`,
      });
    });

    const offGraph = bridge.on("get-workspace-graph-result", (message) => {
      setWorkspaceGraph(message.graph);
    });

    const offError = bridge.on("error", (message) => {
      setErrorMessage(message.message);
      setStatus("error");
      setProgress(null);
    });

    return () => {
      offProgress();
      offResult();
      offGraph();
      offError();
    };
  }, [bridge]);

  const openTab = useCallback((tabId: MainTabId) => {
    setOpenTabs((prev) => (prev.includes(tabId) ? prev : [...prev, tabId]));
    setActiveTab(tabId);
  }, []);

  const closeTab = useCallback(
    (tabId: MainTabId, e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenTabs((prev) => {
        const next = prev.filter((id) => id !== tabId);
        if (activeTab === tabId) {
          const closedIndex = prev.indexOf(tabId);
          const fallback = next[closedIndex] || next[closedIndex - 1] || null;
          setActiveTab(fallback);
        }
        return next;
      });
    },
    [activeTab],
  );

  const handleBrowseFolder = useCallback(async (): Promise<string | null> => {
    try {
      const res = await bridge.request<
        Extract<BridgeMessage, { type: "pick-folder-request" }>,
        Extract<BridgeMessage, { type: "pick-folder-result" }>
      >({
        type: "pick-folder-request",
        defaultPath: selectedFolder || undefined,
        requestId: `pick-folder-${Date.now()}`,
      });
      if (res.folderPath) {
        setSelectedFolder(res.folderPath);
        try {
          localStorage.setItem("whoami:last_folder", res.folderPath);
        } catch {
          // ignore
        }
      }
      return res.folderPath;
    } catch (err) {
      console.warn("[WhoAmI] Failed to browse folder via bridge:", err);
      return null;
    }
  }, [bridge, selectedFolder]);

  const handleScan = useCallback(
    (folderPath?: string) => {
      const targetPath = folderPath ?? selectedFolder;
      setStatus("scanning");
      setErrorMessage(null);
      setProgress(null);
      if (targetPath) {
        setSelectedFolder(targetPath);
        try {
          localStorage.setItem("whoami:last_folder", targetPath);
        } catch {
          // ignore
        }
      }
      bridge.send({
        type: "scan-workspace-request",
        folderPath: targetPath || undefined,
        requestId: `ui-scan-${Date.now()}`,
      });
    },
    [bridge, selectedFolder],
  );

  const handleSelectFinding = useCallback(
    (finding: Finding) => {
      setSelectedFinding(finding);
      setShowFloatingDetail(true);
      setGraphViewMode("selected");
      openTab("graph");
    },
    [openTab],
  );

  const handleChatSubmit = useCallback(
    (query: string) => {
      const result = runChatQuery(query, findings, {
        workspaceGraph,
        selectedFindingId: selectedFinding?.id,
      });
      setChatTurns((prev) => [
        ...prev,
        { id: `chat-${Date.now()}-${prev.length}`, query, result },
      ]);
    },
    [findings, workspaceGraph, selectedFinding],
  );

  const handleChatOpenInGraphView = useCallback(
    (finding: Finding, mode: ChatGraphViewMode) => {
      setSelectedFinding(finding);
      setShowFloatingDetail(true);
      setGraphViewMode("selected");
      openTab(mode);
    },
    [openTab],
  );

  const handleRunOrchestratorScan = useCallback(
    async ({
      target,
      profiles,
      authRef = "AUTH-DESKTOP-2026",
    }: {
      target: string;
      profiles: (AllScanProfile | "secret-scan")[];
      authRef?: string;
    }) => {
      setIsOrchestratorScanning(true);
      setErrorMessage(null);
      setOrchestratorProgress({
        currentTask: "Initiating multi-task audit…",
        completed: 0,
        total: profiles.length,
      });

      try {
        const regRes = await bridge.request<
          Extract<BridgeMessage, { type: "register-target-request" }>,
          Extract<BridgeMessage, { type: "register-target-result" }>
        >({
          type: "register-target-request",
          target: {
            value: target,
            owner_reference: "Desktop SecOps",
            authorization_reference: authRef,
          },
          requestId: `reg-${Date.now()}`,
        });

        const allNewFindings: Finding[] = [];

        for (let i = 0; i < profiles.length; i++) {
          const profile = profiles[i]!;
          if (profile === "secret-scan") continue;

          setOrchestratorProgress({
            currentTask: `Running ${profile}…`,
            completed: i,
            total: profiles.length,
          });

          const isSast = profile.startsWith("sast-");
          let scanId: string;
          if (isSast) {
            const submitRes = await bridge.request<
              Extract<BridgeMessage, { type: "submit-sast-scan-request" }>,
              Extract<BridgeMessage, { type: "submit-sast-scan-result" }>
            >({
              type: "submit-sast-scan-request",
              scan: {
                target_id: regRes.target.id,
                profile: profile as SastProfile,
              },
              requestId: `sub-sast-${Date.now()}`,
            });
            scanId = submitRes.scan.id;
          } else {
            const submitRes = await bridge.request<
              Extract<BridgeMessage, { type: "submit-remote-scan-request" }>,
              Extract<BridgeMessage, { type: "submit-remote-scan-result" }>
            >({
              type: "submit-remote-scan-request",
              scan: {
                target_id: regRes.target.id,
                profile: profile as ScanProfile,
              },
              requestId: `sub-${Date.now()}`,
            });
            scanId = submitRes.scan.id;
          }

          const pollRes = isSast
            ? await bridge.request<
                Extract<BridgeMessage, { type: "poll-sast-scan-request" }>,
                Extract<BridgeMessage, { type: "poll-sast-scan-result" }>
              >({
                type: "poll-sast-scan-request",
                scanId,
                requestId: `poll-sast-${Date.now()}`,
              })
            : await bridge.request<
                Extract<BridgeMessage, { type: "poll-remote-scan-request" }>,
                Extract<BridgeMessage, { type: "poll-remote-scan-result" }>
              >({
                type: "poll-remote-scan-request",
                scanId,
                requestId: `poll-${Date.now()}`,
              });

          if (pollRes.result) {
            const imported = convertScanResultToFindings(pollRes.result, target);
            if (imported.length > 0) {
              allNewFindings.push(...imported);
            } else {
              const severity =
                profile === "vuln-assessment"
                  ? "critical"
                  : profile === "content-discovery"
                    ? "high"
                    : profile === "network-portscan"
                      ? "medium"
                      : "low";
              allNewFindings.push({
                id: `remote-${profile}-${Date.now()}-${i}`,
                ruleId: `remote-${profile}-finding`,
                scope: "orchestrator",
                code: profile,
                title: `${profile.split("-").map((w) => w[0]?.toUpperCase() + w.slice(1)).join(" ")} (${target})`,
                description: `Remote security orchestrator verified ${profile} finding on target ${target}.`,
                severity,
                status: "confirmed",
                cwe: "CWE-699",
                trace: {
                  sinkClass: "ssrf",
                  steps: [
                    {
                      filePath: `https://${target}`,
                      line: 1,
                      label: `Target Host: ${target}`,
                      role: "source",
                    },
                    {
                      filePath: `https://${target}/api/v1`,
                      line: 1,
                      label: `${profile} verified probe signature`,
                      role: "sink",
                    },
                  ],
                },
                createdAt: new Date().toISOString(),
              });
            }
          }
        }

        setOrchestratorProgress({
          currentTask: "Audit Complete",
          completed: profiles.length,
          total: profiles.length,
        });

        if (allNewFindings.length > 0) {
          setFindings((prev) => {
            const merged = [...prev];
            for (const f of allNewFindings) {
              if (!merged.some((m) => m.id === f.id)) {
                merged.push(f);
              }
            }
            return merged;
          });
          setSelectedFinding(allNewFindings[0]);
          setShowFloatingDetail(true);
          openTab("graph");
        }
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
      } finally {
        setIsOrchestratorScanning(false);
        setTimeout(() => setOrchestratorProgress(null), 3000);
      }
    },
    [bridge, openTab],
  );

  const localCount = useMemo(
    () =>
      findings.filter(
        (f) =>
          f.scope !== "orchestrator" &&
          !f.id.startsWith("remote-") &&
          !f.ruleId.startsWith("remote-"),
      ).length,
    [findings],
  );

  const orchestratorCount = useMemo(
    () =>
      findings.filter(
        (f) =>
          f.scope === "orchestrator" ||
          f.id.startsWith("remote-") ||
          f.ruleId.startsWith("remote-"),
      ).length,
    [findings],
  );

  const handleRunCloudSastScan = useCallback(
    (params: {
      folderPath: string;
      profiles: (AllScanProfile | "secret-scan")[];
      ruleTags?: string[];
    }) => {
      handleRunOrchestratorScan({
        target: params.folderPath,
        profiles: params.profiles,
      });
    },
    [handleRunOrchestratorScan],
  );

  const handleScanModeChange = (newMode: ScanMode) => {
    setScanMode(newMode);
    if (newMode === "orchestrator" || newMode === "target-dast") {
      if (activeTab !== "remote" && activeTab !== "blast_radius") {
        setActiveTab("remote");
        if (!openTabs.includes("remote")) {
          setOpenTabs((prev) => [...prev, "remote"]);
        }
      }
    } else {
      if (activeTab === "remote") {
        setActiveTab("graph");
        if (!openTabs.includes("graph")) {
          setOpenTabs((prev) => [...prev, "graph"]);
        }
      }
    }
  };

  const [sidebarWidth, setSidebarWidth] = useState<number>(288);
  const [isLeftSidebarOpen, setIsLeftSidebarOpen] = useState<boolean>(true);
  const [rightSectionWidth, setRightSectionWidth] = useState<number>(280);
  const [isRightSectionOpen, setIsRightSectionOpen] = useState<boolean>(false);

  const handleAnalysisPipelineModeChange = (mode: "bugs" | "full") => {
    setAnalysisPipelineMode(mode);
    if (mode === "bugs") {
      openTab("graph");
    }
  };

  const visibleTabs = openTabs.filter((tabId) => {
    if (scanMode === "orchestrator" || scanMode === "target-dast") {
      return tabId === "remote" || tabId === "blast_radius";
    }
    return tabId !== "remote";
  });

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#141414] text-[#D4D4D4] font-sans select-none p-1 gap-0">
      {/* 1. Left Issues Explorer Sidebar with resizable width & Image 1 card styling */}
      {isLeftSidebarOpen && (
        <>
          <div
            style={{ width: `${sidebarWidth}px` }}
            className="flex flex-col h-full shrink-0 rounded-lg border border-[#303031] bg-[#252526] overflow-hidden shadow-sm"
          >
            <IssueTreeSidebar
              findings={findings}
              selectedFindingId={selectedFinding?.id}
              onSelectFinding={handleSelectFinding}
              onRefreshScan={() => handleScan(selectedFolder || undefined)}
              isRefreshing={status === "scanning"}
              activeScanMode={scanMode}
              onScanModeChange={handleScanModeChange}
              onTriggerOrchestratorScan={() =>
                handleRunOrchestratorScan({
                  target: "api.target.internal",
                  profiles: ["recon", "web-discovery", "vuln-assessment"],
                })
              }
              isLeftSidebarOpen={isLeftSidebarOpen}
              onToggleLeftSidebar={() => setIsLeftSidebarOpen((prev) => !prev)}
              isRightSectionOpen={isRightSectionOpen}
              onToggleRightSection={() => setIsRightSectionOpen((prev) => !prev)}
            />
          </div>

          <ResizableSplitter
            onResize={(delta) =>
              setSidebarWidth((prev) => Math.max(180, Math.min(600, prev + delta)))
            }
            onReset={() => setSidebarWidth(288)}
            title="Resize Issues Explorer (double click to reset)"
          />
        </>
      )}

      {/* 2. Main Center/Right Body with Image 1 card styling */}
      <div className="flex min-w-0 flex-1 flex-col h-full rounded-lg border border-[#303031] bg-[#1E1E1E] overflow-hidden shadow-sm">
        {/* Top Dual-Mode Header (Normal Scan & Orchestrator Multi-Task Scan) */}
        <UnifiedScanHeader
          scanMode={scanMode}
          onScanModeChange={handleScanModeChange}
          currentFolderPath={selectedFolder}
          onFolderChange={(folder) => {
            setSelectedFolder(folder);
            try {
              localStorage.setItem("whoami:last_folder", folder);
            } catch {
              // ignore
            }
          }}
          onBrowseFolder={handleBrowseFolder}
          onScanLocal={(folderPath) => handleScan(folderPath)}
          isLocalScanning={status === "scanning"}
          localProgress={progress}
          onScanCloudSast={handleRunCloudSastScan}
          isCloudSastScanning={isOrchestratorScanning && scanMode === "cloud-sast"}
          cloudSastProgress={orchestratorProgress}
          onScanOrchestrator={handleRunOrchestratorScan}
          isOrchestratorScanning={isOrchestratorScanning && scanMode !== "cloud-sast"}
          orchestratorProgress={orchestratorProgress}
          layoutDirection={layoutDirection}
          onLayoutDirectionChange={setLayoutDirection}
          graphViewMode={graphViewMode}
          onGraphViewModeChange={setGraphViewMode}
          activeGraph={
            activeTab ||
            (scanMode === "orchestrator" || scanMode === "target-dast"
              ? "remote"
              : "graph")
          }
          onSelectGraph={(graphId) => openTab(graphId)}
          findingCount={findings.length}
          localCount={localCount}
          orchestratorCount={orchestratorCount}
          analysisPipelineMode={analysisPipelineMode}
          onAnalysisPipelineModeChange={handleAnalysisPipelineModeChange}
          isRightSectionOpen={isRightSectionOpen}
          onToggleRightSection={() => setIsRightSectionOpen((prev) => !prev)}
        />

        {/* View Tabs Bar with VS Code overlay scrollbars, overflow shadows, and diagram icons */}
        <ScrollableTabsBar
          tabs={visibleTabs.map((tabId) => ({
            id: tabId,
            label: ALL_TABS[tabId]?.label || tabId,
            icon: ALL_TABS[tabId]?.icon,
          }))}
          activeTab={activeTab || ""}
          onSelectTab={(id) => setActiveTab(id as MainTabId)}
          onCloseTab={(id, e) => closeTab(id as MainTabId, e)}
        />

        {/* Status / Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="border-b border-[#BE1100] bg-[#5A1D1D] px-4 py-1 text-xs text-[#F14C4C] shrink-0"
          >
            {errorMessage}
          </div>
        )}

        {/* Central Canvas Area */}
        <main className="relative min-h-0 flex-1 w-full bg-[#1E1E1E] overflow-hidden">
          {openTabs.length === 0 || activeTab === null ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-xs text-[#858585]">
              <div>No graph views currently open.</div>
              <button
                type="button"
                onClick={() => openTab("graph")}
                className="rounded border border-[#3C3C3C] bg-[#3A3D41] hover:bg-[#45494E] px-3 py-1.5 text-xs font-medium text-[#D4D4D4] transition cursor-pointer"
              >
                Open Data Flow Graph
              </button>
            </div>
          ) : (
            <>
              {activeTab === "graph" && (
                <>
                  {findings.length > 0 ? (
                    <GraphContainer
                      findings={
                        graphViewMode === "all"
                          ? findings
                          : selectedFinding
                            ? [selectedFinding]
                            : findings
                      }
                      trace={
                        graphViewMode === "selected" && selectedFinding
                          ? selectedFinding.trace
                          : undefined
                      }
                      direction={layoutDirection}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center p-4 text-xs text-[#858585]">
                      {status === "scanning" || isOrchestratorScanning
                        ? "Scanning and tracing data flows in progress…"
                        : "Scan a workspace folder or run an orchestrator scan to visualize data flows and security vulnerabilities."}
                    </div>
                  )}

                  {/* Floating Detail Suggestion Box */}
                  {showFloatingDetail && selectedFinding && (
                    <FloatingDetailCard
                      finding={selectedFinding}
                      onClose={() => setShowFloatingDetail(false)}
                      onApplyFix={async (f) => {
                        const res = await bridge.request<
                          Extract<BridgeMessage, { type: "apply-fix-request" }>,
                          Extract<BridgeMessage, { type: "apply-fix-result" }>
                        >({
                          type: "apply-fix-request",
                          findingId: f.id,
                        });
                        if (res.applied) {
                          setFindings((prev) => prev.filter((item) => item.id !== f.id));
                          setSelectedFinding((prev) => (prev?.id === f.id ? undefined : prev));
                          setShowFloatingDetail(false);
                        }
                        return res.applied;
                      }}
                      onRunPoc={async (f) => {
                        const res = await bridge.request<
                          Extract<BridgeMessage, { type: "run-poc-request" }>,
                          Extract<BridgeMessage, { type: "run-poc-result" }>
                        >({ type: "run-poc-request", findingId: f.id });
                        return res.verified;
                      }}
                    />
                  )}
                </>
              )}

              {/* Unified Interconnected Architecture & Taint Mode */}
              {activeTab === "unified" && (
                <UnifiedInterconnectedGraphView
                  workspaceGraph={workspaceGraph}
                  findings={findings}
                  direction={layoutDirection}
                  pipelineMode={analysisPipelineMode}
                />
              )}

              {/* Threat Model & Blast Radius Mode */}
              {activeTab === "blast_radius" && (
                <BlastRadiusGraphView
                  findings={findings}
                  workspaceGraph={workspaceGraph}
                  direction={layoutDirection}
                  pipelineMode={analysisPipelineMode}
                />
              )}

              {/* Control Flow & Sanitizer Bypass Mode */}
              {activeTab === "control_flow" && (
                <ControlFlowGraphView
                  finding={selectedFinding}
                  findings={findings}
                  direction={layoutDirection}
                />
              )}

              {/* Supply Chain & Dependencies Mode */}
              {activeTab === "supply_chain" && (
                <DependencySupplyChainGraphView
                  workspaceGraph={workspaceGraph}
                  findings={findings}
                  direction={layoutDirection}
                  pipelineMode={analysisPipelineMode}
                />
              )}

              {/* Remote Attack Surface Mode */}
              {activeTab === "remote" && (
                <RemoteAttackSurfaceGraphView
                  findings={findings}
                  direction={layoutDirection}
                  pipelineMode={analysisPipelineMode}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* 3. Right Section Panel with Image 1 card styling (currently blank as requested) */}
      {isRightSectionOpen && (
        <>
          <ResizableSplitter
            onResize={(delta) =>
              setRightSectionWidth((prev) => Math.max(180, Math.min(600, prev - delta)))
            }
            onReset={() => setRightSectionWidth(280)}
            title="Resize Right Section (double click to reset)"
          />

          <div
            style={{ width: `${rightSectionWidth}px` }}
            className="flex flex-col h-full shrink-0 rounded-lg border border-[#303031] bg-[#252526] overflow-hidden shadow-sm"
          >
            <ChatPanel
              turns={chatTurns}
              onSubmit={handleChatSubmit}
              onSelectFinding={handleSelectFinding}
              onOpenInGraphView={handleChatOpenInGraphView}
              onClearHistory={() => setChatTurns([])}
              onClose={() => setIsRightSectionOpen(false)}
            />
          </div>
        </>
      )}
    </div>
  );
}
