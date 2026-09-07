import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UnifiedScanHeader } from "../components/UnifiedScanHeader.js";

describe("UnifiedScanHeader", () => {
  it("renders Local Scan mode controls by default", () => {
    render(<UnifiedScanHeader scanMode="local" />);

    expect(screen.getByText("Directory:")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scan Folder" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All Flows" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Selected Flow" })).toBeTruthy();
  });

  it("triggers onScanLocal with the selected folder path", () => {
    const handleScanLocal = vi.fn();
    render(
      <UnifiedScanHeader
        scanMode="local"
        currentFolderPath="/mock/project/path"
        onScanLocal={handleScanLocal}
      />,
    );

    const scanBtn = screen.getByRole("button", { name: "Scan Folder" });
    fireEvent.click(scanBtn);

    expect(handleScanLocal).toHaveBeenCalledTimes(1);
    expect(handleScanLocal).toHaveBeenCalledWith("/mock/project/path");
  });

  it("allows browsing for a folder and populating the directory input", async () => {
    const handleBrowseFolder = vi.fn().mockResolvedValue("/chosen/directory/path");
    const handleScanLocal = vi.fn();
    const handleFolderChange = vi.fn();

    render(
      <UnifiedScanHeader
        scanMode="local"
        onBrowseFolder={handleBrowseFolder}
        onFolderChange={handleFolderChange}
        onScanLocal={handleScanLocal}
      />,
    );

    const browseBtn = screen.getByRole("button", { name: "Browse folder" });
    fireEvent.click(browseBtn);

    expect(handleBrowseFolder).toHaveBeenCalledTimes(1);

    // Wait for promise resolution and input update
    await vi.waitFor(() => {
      expect(handleFolderChange).toHaveBeenCalledWith("/chosen/directory/path");
      const input = screen.getByPlaceholderText("Workspace folder…") as HTMLInputElement;
      expect(input.value).toBe("/chosen/directory/path");
    });

    // Now click Scan Folder
    const scanBtn = screen.getByRole("button", { name: "Scan Folder" });
    fireEvent.click(scanBtn);

    expect(handleScanLocal).toHaveBeenCalledTimes(1);
    expect(handleScanLocal).toHaveBeenCalledWith("/chosen/directory/path");
  });

  it("renders Orchestrator Scan mode controls when scanMode is orchestrator", () => {
    render(<UnifiedScanHeader scanMode="orchestrator" />);

    expect(screen.getByText("Target:")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scan Target" })).toBeTruthy();
  });

  it("allows selecting multiple tasks via checkboxes in Orchestrator mode", () => {
    const handleScanOrchestrator = vi.fn();
    render(
      <UnifiedScanHeader
        scanMode="orchestrator"
        onScanOrchestrator={handleScanOrchestrator}
      />,
    );

    // Open task dropdown
    const taskDropdownBtn = screen.getByText(/Tasks Active/);
    fireEvent.click(taskDropdownBtn);

    // Check that tasks are displayed with checkboxes
    expect(screen.getByText("Scan Task Profiles")).toBeTruthy();
    expect(screen.getByText("Fast Recon")).toBeTruthy();
    expect(screen.getByText("Full Network Scan")).toBeTruthy();

    // Toggle a task
    fireEvent.click(screen.getByText("Full Network Scan"));

    // Run orchestrator scan
    const runBtn = screen.getByRole("button", { name: "Scan Target" });
    fireEvent.click(runBtn);

    expect(handleScanOrchestrator).toHaveBeenCalledTimes(1);
    expect(handleScanOrchestrator).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.any(String),
        profiles: expect.arrayContaining(["network-portscan"]),
      }),
    );
  });

  it("triggers onAnalysisPipelineModeChange when switching between Bugs and Full Codebase view", () => {
    const handlePipelineChange = vi.fn();
    render(
      <UnifiedScanHeader
        analysisPipelineMode="bugs"
        onAnalysisPipelineModeChange={handlePipelineChange}
      />,
    );

    const fullCodeBtn = screen.getByTitle("Full Codebase Architecture & Unified Pipeline");
    fireEvent.click(fullCodeBtn);

    expect(handlePipelineChange).toHaveBeenCalledWith("full");

    const bugsBtn = screen.getByTitle("Bugs & Vulnerability Analysis Pipeline (Focus View)");
    fireEvent.click(bugsBtn);

    expect(handlePipelineChange).toHaveBeenCalledWith("bugs");
  });

  it("renders pause icon and updates title when local scan is in progress", () => {
    render(<UnifiedScanHeader scanMode="local" isLocalScanning={true} />);
    const scanBtn = screen.getByRole("button", { name: "Scan Folder" });
    expect(scanBtn.getAttribute("title")).toContain("Pause");
  });

  it("renders pause icon and updates title when orchestrator scan is in progress", () => {
    render(<UnifiedScanHeader scanMode="orchestrator" isOrchestratorScanning={true} />);
    const scanBtn = screen.getByRole("button", { name: "Scan Target" });
    expect(scanBtn.getAttribute("title")).toContain("Pause");
  });

  it("opens Whole Code architecture dropdown and selects a diagram", () => {
    const handleSelectGraph = vi.fn();
    const handlePipelineChange = vi.fn();
    render(
      <UnifiedScanHeader
        activeGraph="graph"
        analysisPipelineMode="bugs"
        onSelectGraph={handleSelectGraph}
        onAnalysisPipelineModeChange={handlePipelineChange}
      />,
    );

    const wholeCodeBtn = screen.getByTitle("Full Codebase Architecture & Unified Pipeline");
    fireEvent.click(wholeCodeBtn);

    // Verify Whole Code architecture options appear
    expect(screen.getByText("Whole Code Architecture Diagrams")).toBeTruthy();
    expect(screen.getByText("Control Flow & Decision Gates")).toBeTruthy();

    // Select an architecture diagram
    fireEvent.click(screen.getByText("Control Flow & Decision Gates"));

    expect(handlePipelineChange).toHaveBeenCalledWith("full");
    expect(handleSelectGraph).toHaveBeenCalledWith("control_flow");
  });

  it("renders Right Section toggle button and triggers callback", () => {
    const handleToggleRight = vi.fn();
    render(
      <UnifiedScanHeader
        onToggleRightSection={handleToggleRight}
        isRightSectionOpen={false}
      />,
    );

    const toggleBtn = screen.getByRole("button", { name: "Show Right Section" });
    expect(toggleBtn).toBeTruthy();

    fireEvent.click(toggleBtn);
    expect(handleToggleRight).toHaveBeenCalledTimes(1);
  });

  it("renders Cloud SAST mode controls when scanMode is cloud-sast", () => {
    const handleScanCloudSast = vi.fn();
    render(
      <UnifiedScanHeader
        scanMode="cloud-sast"
        currentFolderPath="/mock/cloud-project"
        onScanCloudSast={handleScanCloudSast}
      />,
    );

    expect(screen.getByText("Directory:")).toBeTruthy();
    expect(screen.getByText("3 SAST Active")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scan Cloud SAST" })).toBeTruthy();

    // Trigger Cloud SAST
    const sastBtn = screen.getByRole("button", { name: "Scan Cloud SAST" });
    fireEvent.click(sastBtn);

    expect(handleScanCloudSast).toHaveBeenCalledTimes(1);
    expect(handleScanCloudSast).toHaveBeenCalledWith({
      folderPath: "/mock/cloud-project",
      profiles: ["sast-joern", "sast-semgrep", "sast-trufflehog"],
    });
  });
});
