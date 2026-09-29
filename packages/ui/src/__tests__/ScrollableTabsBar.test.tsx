import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScrollableTabsBar, type TabItem } from "../components/ScrollableTabsBar.js";

describe("ScrollableTabsBar", () => {
  const tabs: TabItem[] = [
    { id: "graph", label: "Data Flow DAG" },
    { id: "unified", label: "Unified Architecture" },
    { id: "control_flow", label: "Control Flow" },
  ];

  it("renders all tabs with labels and highlights active tab", () => {
    render(
      <ScrollableTabsBar
        tabs={tabs}
        activeTab="graph"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );

    expect(screen.getByText("Data Flow DAG")).toBeTruthy();
    expect(screen.getByText("Unified Architecture")).toBeTruthy();
    expect(screen.getByText("Control Flow")).toBeTruthy();

    const activeEl = screen.getByText("Data Flow DAG").closest("div");
    expect(activeEl?.className).toContain("border-vscode-focus");
  });

  it("triggers onSelectTab when a tab is clicked", () => {
    const handleSelect = vi.fn();
    render(
      <ScrollableTabsBar
        tabs={tabs}
        activeTab="graph"
        onSelectTab={handleSelect}
        onCloseTab={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Unified Architecture"));
    expect(handleSelect).toHaveBeenCalledWith("unified");
  });

  it("triggers onCloseTab when the close button is clicked", () => {
    const handleClose = vi.fn();
    render(
      <ScrollableTabsBar
        tabs={tabs}
        activeTab="graph"
        onSelectTab={vi.fn()}
        onCloseTab={handleClose}
      />,
    );

    const closeBtn = screen.getByTitle("Close Unified Architecture");
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalledWith("unified", expect.anything());
  });

  it("closes tab on middle-click (button 1)", () => {
    const handleClose = vi.fn();
    render(
      <ScrollableTabsBar
        tabs={tabs}
        activeTab="graph"
        onSelectTab={vi.fn()}
        onCloseTab={handleClose}
      />,
    );

    const tabEl = screen.getByText("Control Flow");
    fireEvent(
      tabEl,
      new MouseEvent("auxclick", {
        bubbles: true,
        cancelable: true,
        button: 1,
      }),
    );
    expect(handleClose).toHaveBeenCalledWith("control_flow", expect.anything());
  });

  it("handles mouse wheel event on tabs container", () => {
    const { container } = render(
      <ScrollableTabsBar
        tabs={tabs}
        activeTab="graph"
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );

    const scrollContainer = container.querySelector(".overflow-x-auto");
    expect(scrollContainer).toBeTruthy();
    if (scrollContainer) {
      fireEvent.wheel(scrollContainer, { deltaY: 100 });
    }
  });
});
