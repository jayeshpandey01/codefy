import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Finding } from "@whoami/types";
import { IssueTreeSidebar } from "../components/IssueTreeSidebar.js";

function buildTestFindings(): Finding[] {
  return [
    {
      id: "finding-1",
      ruleId: "js-syntax-error",
      status: "confirmed",
      severity: "high",
      title: "Syntax Error (tsx) at line 20",
      description: "Missing closing tag",
      createdAt: "2026-08-30T12:00:00.000Z",
      trace: {
        sinkClass: "command-injection",
        steps: [
          {
            role: "sink",
            label: "hero-section.tsx:20",
            filePath: "components/hero-section.tsx",
            line: 20,
          },
        ],
      },
    },
    {
      id: "finding-2",
      ruleId: "js-syntax-error",
      status: "confirmed",
      severity: "high",
      title: "Syntax Error (tsx) at line 27",
      description: "Unexpected token",
      createdAt: "2026-08-30T12:00:00.000Z",
      trace: {
        sinkClass: "command-injection",
        steps: [
          {
            role: "sink",
            label: "hero-section.tsx:27",
            filePath: "components/hero-section.tsx",
            line: 27,
          },
        ],
      },
    },
    {
      id: "remote-scan-1-0",
      ruleId: "remote-cve-2024-1234",
      scope: "orchestrator",
      status: "confirmed",
      severity: "critical",
      title: "CVE-2024-1234 Remote Code Execution in API Gateway",
      description: "Unauthenticated RCE vulnerability",
      createdAt: "2026-08-30T12:00:00.000Z",
      trace: {
        sinkClass: "command-injection",
        steps: [
          {
            role: "sink",
            label: "https://api.target.internal/v1",
            filePath: "https://api.target.internal/v1",
            line: 1,
          },
        ],
      },
    },
  ];
}

describe("IssueTreeSidebar", () => {
  it("renders Local section by default and filters local findings", () => {
    const handleSelect = vi.fn();
    render(
      <IssueTreeSidebar
        findings={buildTestFindings()}
        onSelectFinding={handleSelect}
        activeScanMode="local"
      />,
    );

    expect(screen.getByText("Issues")).toBeTruthy();
    expect(screen.getByTitle("Issues Menu (Scan Modes, Grouping, Actions)")).toBeTruthy();
    expect(screen.getByText("hero-section.tsx")).toBeTruthy();
    expect(screen.getByText("Syntax Error (tsx) at line 20")).toBeTruthy();
    // Remote issue shouldn't be in Local section
    expect(screen.queryByText("CVE-2024-1234 Remote Code Execution in API Gateway")).toBeNull();
  });

  it("switches to Orchestrator section when clicked", () => {
    const handleSelect = vi.fn();
    const handleModeChange = vi.fn();
    render(
      <IssueTreeSidebar
        findings={buildTestFindings()}
        onSelectFinding={handleSelect}
        activeScanMode="local"
        onScanModeChange={handleModeChange}
      />,
    );

    // Open ≡ menu
    fireEvent.click(screen.getByTitle("Issues Menu (Scan Modes, Grouping, Actions)"));

    // Click Target DAST / Orchestrator option
    fireEvent.click(screen.getByText("Target DAST"));

    expect(handleModeChange).toHaveBeenCalledWith("orchestrator");
    expect(screen.getByText("CVE-2024-1234 Remote Code Execution in API Gateway")).toBeTruthy();
    expect(screen.queryByText("Syntax Error (tsx) at line 20")).toBeNull();
  });

  it("switches grouping mode to By Severity when selected", () => {
    const handleSelect = vi.fn();
    render(
      <IssueTreeSidebar
        findings={buildTestFindings()}
        onSelectFinding={handleSelect}
        activeScanMode="all"
      />,
    );

    // Open ≡ menu
    fireEvent.click(screen.getByTitle("Issues Menu (Scan Modes, Grouping, Actions)"));

    // Select By Severity
    fireEvent.click(screen.getByText("By Severity"));

    expect(screen.getByText("High")).toBeTruthy();
    expect(screen.getByText("Critical")).toBeTruthy();
  });

  it("filters findings using the search bar", () => {
    const handleSelect = vi.fn();
    render(
      <IssueTreeSidebar
        findings={buildTestFindings()}
        onSelectFinding={handleSelect}
        activeScanMode="all"
      />,
    );

    const searchInput = screen.getByPlaceholderText(/Filter/);
    fireEvent.change(searchInput, { target: { value: "CVE-2024" } });

    expect(screen.getByText("CVE-2024-1234 Remote Code Execution in API Gateway")).toBeTruthy();
    expect(screen.queryByText("Syntax Error (tsx) at line 20")).toBeNull();
  });

  it("renders primary sidebar toggle button and triggers callback", () => {
    const handleToggleLeft = vi.fn();
    render(
      <IssueTreeSidebar
        findings={buildTestFindings()}
        onSelectFinding={vi.fn()}
        onToggleLeftSidebar={handleToggleLeft}
      />,
    );

    const leftBtn = screen.getByRole("button", { name: "Toggle Primary Sidebar" });
    expect(leftBtn).toBeTruthy();

    fireEvent.click(leftBtn);
    expect(handleToggleLeft).toHaveBeenCalledTimes(1);
  });

  it("allows switching between 3 tiers (Local Offline, Cloud SAST, and Target DAST) via ≡ menu", () => {
    const handleModeChange = vi.fn();
    render(
      <IssueTreeSidebar
        findings={buildTestFindings()}
        onSelectFinding={vi.fn()}
        activeScanMode="local-offline"
        onScanModeChange={handleModeChange}
      />,
    );

    expect(screen.getByTitle("Issues Menu (Scan Modes, Grouping, Actions)")).toBeTruthy();

    // Open ≡ menu and select Cloud SAST
    fireEvent.click(screen.getByTitle("Issues Menu (Scan Modes, Grouping, Actions)"));
    fireEvent.click(screen.getByText("Cloud SAST"));
    expect(handleModeChange).toHaveBeenCalledWith("cloud-sast");

    // Open ≡ menu and select Target DAST
    fireEvent.click(screen.getByTitle("Issues Menu (Scan Modes, Grouping, Actions)"));
    fireEvent.click(screen.getByText("Target DAST"));
    expect(handleModeChange).toHaveBeenCalledWith("orchestrator");

    // Open ≡ menu and select Local (Offline)
    fireEvent.click(screen.getByTitle("Issues Menu (Scan Modes, Grouping, Actions)"));
    fireEvent.click(screen.getByText("Local (Offline)"));
    expect(handleModeChange).toHaveBeenCalledWith("local-offline");
  });
});
