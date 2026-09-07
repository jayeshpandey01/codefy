import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GraphSelectorDropdown } from "../components/GraphSelectorDropdown.js";

describe("GraphSelectorDropdown", () => {
  it("renders the active graph view button with icon and title", () => {
    render(
      <GraphSelectorDropdown
        activeGraph="graph"
        findingCount={3}
        scanMode="local"
      />,
    );

    expect(screen.getByTitle("Switch Graph View")).toBeTruthy();
    expect(screen.getByText("Data Flow DAG")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("filters and lists only local codebase diagrams when scanMode is local", () => {
    render(<GraphSelectorDropdown activeGraph="graph" scanMode="local" />);

    const trigger = screen.getByTitle("Switch Graph View");
    fireEvent.click(trigger);

    expect(screen.getByText("Local Analysis Diagrams")).toBeTruthy();
    expect(screen.getAllByText("Data Flow DAG").length).toBeGreaterThan(0);
    expect(screen.getByText("Unified Architecture + Taint")).toBeTruthy();
    expect(screen.getByText("Control Flow & Decision Gates")).toBeTruthy();
    expect(screen.getByText("Supply Chain & Dependencies")).toBeTruthy();
    expect(screen.getByText("Threat Model & Blast Radius")).toBeTruthy();
    // Remote Attack Surface should NOT be present in local mode
    expect(screen.queryByText("Remote Attack Surface")).toBeNull();
  });

  it("filters and lists only orchestrator recon diagrams when scanMode is orchestrator", () => {
    render(
      <GraphSelectorDropdown activeGraph="remote" scanMode="orchestrator" />,
    );

    const trigger = screen.getByTitle("Switch Graph View");
    fireEvent.click(trigger);

    expect(screen.getByText("Orchestrator Recon Diagrams")).toBeTruthy();
    expect(screen.getAllByText("Remote Attack Surface").length).toBeGreaterThan(0);
    expect(screen.getByText("Threat Model & Blast Radius")).toBeTruthy();
    // Local-only diagrams should NOT be present in orchestrator mode
    expect(screen.queryByText("Data Flow DAG")).toBeNull();
    expect(screen.queryByText("Unified Architecture + Taint")).toBeNull();
    expect(screen.queryByText("Control Flow & Decision Gates")).toBeNull();
    expect(screen.queryByText("Supply Chain & Dependencies")).toBeNull();
  });

  it("calls onSelectGraph when a graph option is clicked", () => {
    const handleSelectGraph = vi.fn();
    render(
      <GraphSelectorDropdown
        activeGraph="graph"
        onSelectGraph={handleSelectGraph}
        scanMode="local"
      />,
    );

    // Open dropdown
    fireEvent.click(screen.getByTitle("Switch Graph View"));

    // Select Control Flow & Decision Gates
    const controlFlowOption = screen.getByText("Control Flow & Decision Gates");
    fireEvent.click(controlFlowOption);

    expect(handleSelectGraph).toHaveBeenCalledTimes(1);
    expect(handleSelectGraph).toHaveBeenCalledWith("control_flow");
  });
});
