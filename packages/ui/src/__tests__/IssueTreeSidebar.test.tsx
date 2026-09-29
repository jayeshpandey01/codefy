import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Finding, ScanResultRead } from "@whoami/types";
import { IssueTreeSidebar } from "../components/IssueTreeSidebar.js";
import { convertScanResultToFindings } from "../components/RemoteScanPanel.js";

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

  it("directly switches between All, SAST, and DAST via visible top pills without opening ≡ menu", () => {
    const handleModeChange = vi.fn();
    render(
      <IssueTreeSidebar
        findings={buildTestFindings()}
        onSelectFinding={vi.fn()}
        activeScanMode="all"
        onScanModeChange={handleModeChange}
      />,
    );

    // Direct SAST pill is visible
    const sastPill = screen.getByTitle("Filter to SAST (Static Code Analysis & Secrets)");
    expect(sastPill).toBeTruthy();
    fireEvent.click(sastPill);
    expect(handleModeChange).toHaveBeenCalledWith("local-offline");

    // Direct DAST pill is visible
    const dastPill = screen.getByTitle("Filter to DAST (Dynamic Endpoints & Probes)");
    expect(dastPill).toBeTruthy();
    fireEvent.click(dastPill);
    expect(handleModeChange).toHaveBeenCalledWith("orchestrator");

    // All pill is visible
    const allPill = screen.getByTitle("Show All Issues (SAST & DAST)");
    expect(allPill).toBeTruthy();
    fireEvent.click(allPill);
  });

  it("renders both SAST and DAST sections in All mode and allows collapse/expand", () => {
    render(
      <IssueTreeSidebar
        findings={buildTestFindings()}
        onSelectFinding={vi.fn()}
        activeScanMode="all"
      />,
    );

    // Both section headers are present
    expect(screen.getByText("SAST (Static Analysis)")).toBeTruthy();
    expect(screen.getByText("DAST (Dynamic Analysis)")).toBeTruthy();

    // Findings from both sections are visible
    expect(screen.getByText("Syntax Error (tsx) at line 20")).toBeTruthy();
    expect(screen.getByText("CVE-2024-1234 Remote Code Execution in API Gateway")).toBeTruthy();

    // Collapse SAST section
    fireEvent.click(screen.getByText("SAST (Static Analysis)"));
    expect(screen.queryByText("Syntax Error (tsx) at line 20")).toBeNull();
    // DAST finding remains visible
    expect(screen.getByText("CVE-2024-1234 Remote Code Execution in API Gateway")).toBeTruthy();

    // Collapse DAST section
    fireEvent.click(screen.getByText("DAST (Dynamic Analysis)"));
    expect(screen.queryByText("CVE-2024-1234 Remote Code Execution in API Gateway")).toBeNull();
  });

  it("does not render the bottom dock and maximizes tree viewport", () => {
    render(
      <IssueTreeSidebar
        findings={buildTestFindings()}
        onSelectFinding={vi.fn()}
        activeScanMode="local"
      />,
    );

    expect(screen.queryByText("Scan Engines & Status")).toBeNull();
  });

  it("properly categorizes DAST findings with domain paths like nasa.gov:1 into DAST pill and section", () => {
    const findingsWithDastDomain: Finding[] = [
      ...buildTestFindings().slice(0, 2), // 2 local SAST syntax errors
      {
        id: "remote-scan-nasa-1",
        ruleId: "remote-sec-header-missing-csp",
        code: "SEC_HEADER_MISSING_CSP",
        scope: "code", // even if legacy/misclassified scope was 'code'
        status: "confirmed",
        severity: "low",
        title: "Content-Security-Policy header is missing",
        description: "CSP header is missing on nasa.gov",
        createdAt: "2026-09-18T12:00:00.000Z",
        trace: {
          sinkClass: "ssrf",
          steps: [
            {
              role: "source",
              label: "Source: nasa.gov",
              filePath: "nasa.gov",
              line: 1,
            },
            {
              role: "sink",
              label: "Content-Security-Policy header is missing (SEC_HEADER_MISSING_CSP)",
              filePath: "nasa.gov",
              line: 1,
            },
          ],
        },
      },
    ];

    render(
      <IssueTreeSidebar
        findings={findingsWithDastDomain}
        onSelectFinding={vi.fn()}
        activeScanMode="all"
      />,
    );

    // SAST pill should show 2, DAST pill should show 1 (NOT SAST 3, DAST 0)
    const sastPill = screen.getByTitle("Filter to SAST (Static Code Analysis & Secrets)");
    const dastPill = screen.getByTitle("Filter to DAST (Dynamic Endpoints & Probes)");

    expect(sastPill.textContent).toContain("2");
    expect(dastPill.textContent).toContain("1");
  });

  it("convertScanResultToFindings accurately classifies DAST findings with check codes as endpoint scope", () => {
    const mockResult: ScanResultRead = {
      id: "scan-dast-nasa",
      scan_job_id: "job-nasa-1",
      created_at: "2026-09-18T12:00:00.000Z",
      artifact: null,
      error_logs: null,
      summary: {
        findings: [
          {
            code: "SEC_HEADER_MISSING_CSP",
            title: "Content-Security-Policy header is missing",
            severity: "low",
            description: "Missing header",
            host: "nasa.gov",
            matched_at: "https://nasa.gov",
          },
        ],
      },
    };

    // Auto-inferred
    const converted = convertScanResultToFindings(mockResult, "nasa.gov");
    expect(converted.length).toBe(1);
    expect(converted[0]?.scope).toBe("endpoint");
    expect(converted[0]?.code).toBe("SEC_HEADER_MISSING_CSP");
    expect(converted[0]?.ruleId).toBe("remote-sec-header-missing-csp");
    expect(converted[0]?.trace.steps[0]?.filePath).toBe("https://nasa.gov");

    // With explicit profile
    const convertedWithProfile = convertScanResultToFindings(mockResult, "nasa.gov", {
      isSast: false,
      profile: "recon",
    });
    expect(convertedWithProfile[0]?.scope).toBe("endpoint");
  });
});
