import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ChatResult, Finding } from "@whoami/types";
import { ChatPanel, type ChatTurn } from "../components/ChatPanel.js";
import { BridgeProvider } from "../bridge/BridgeContext.js";
import { MockBridgeClient } from "../bridge/MockBridgeClient.js";

function buildFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "F-10291",
    ruleId: "js-sql-injection-string-concat",
    status: "confirmed",
    severity: "critical",
    title: "SQL Injection",
    description: "SQL query built via string concatenation.",
    cwe: "CWE-89",
    createdAt: "2026-09-01T00:00:00.000Z",
    trace: {
      sinkClass: "sql-injection",
      steps: [
        { role: "source", label: "req.body", filePath: "api/users.py", line: 42 },
        { role: "sink", label: "db.execute", filePath: "database.py", line: 87 },
      ],
    },
    ...overrides,
  };
}

function renderPanel(turns: ChatTurn[], overrides: Partial<{
  onSubmit: (query: string) => void;
  onSelectFinding: (finding: Finding) => void;
  onOpenInGraphView: (finding: Finding, mode: NonNullable<ChatResult["graphViewMode"]>) => void;
}> = {}) {
  const bridge = new MockBridgeClient();
  const onSubmit = overrides.onSubmit ?? vi.fn();
  const onSelectFinding = overrides.onSelectFinding ?? vi.fn();
  const onOpenInGraphView = overrides.onOpenInGraphView ?? vi.fn();

  render(
    <BridgeProvider client={bridge}>
      <ChatPanel
        turns={turns}
        onSubmit={onSubmit}
        onSelectFinding={onSelectFinding}
        onOpenInGraphView={onOpenInGraphView}
      />
    </BridgeProvider>,
  );

  return { bridge, onSubmit, onSelectFinding, onOpenInGraphView };
}

describe("ChatPanel", () => {
  it("shows an empty-state prompt when there are no turns yet", () => {
    renderPanel([]);
    expect(screen.getByText("Ask about this scan's findings")).toBeTruthy();
  });

  it("submits the typed question on Enter and clears the input", () => {
    const { onSubmit } = renderPanel([]);
    const textarea = screen.getByPlaceholderText("Ask about this scan's findings…");

    fireEvent.change(textarea, { target: { value: "show critical bugs" } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSubmit).toHaveBeenCalledWith("show critical bugs");
    expect((textarea as HTMLTextAreaElement).value).toBe("");
  });

  it("does not submit an empty/whitespace-only question", () => {
    const { onSubmit } = renderPanel([]);
    const textarea = screen.getByPlaceholderText("Ask about this scan's findings…");

    fireEvent.change(textarea, { target: { value: "   " } });
    fireEvent.keyDown(textarea, { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("opens history menu when clicking ≡ history button", () => {
    renderPanel([]);
    expect(screen.getByTitle("Chat History")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Chat History"));
    expect(screen.getByText("No conversation history yet")).toBeTruthy();
  });

  it("renders a SUPPORTED turn with its finding card and a Show Path action", () => {
    const finding = buildFinding();
    const result: ChatResult = {
      capability: "SUPPORTED",
      intent: "LIST_FINDINGS",
      findings: [finding],
      graphViewMode: "graph",
      explanation: "1 finding(s) matched.",
    };
    const turns: ChatTurn[] = [{ id: "t1", query: "show critical bugs", result }];

    const { onOpenInGraphView, onSelectFinding } = renderPanel(turns);

    expect(screen.getByText("show critical bugs")).toBeTruthy();
    expect(screen.getByText("Answered")).toBeTruthy();
    expect(screen.getByText("SQL Injection")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Show in Data Flow DAG/ }));
    expect(onOpenInGraphView).toHaveBeenCalledWith(finding, "graph");

    fireEvent.click(screen.getByText("SQL Injection"));
    expect(onSelectFinding).toHaveBeenCalledWith(finding);
  });

  it("renders UNSUPPORTED suggestions and re-submits one when clicked", () => {
    const result: ChatResult = {
      capability: "UNSUPPORTED",
      findings: [],
      explanation: "I couldn't map this to a supported query.",
      suggestions: ["Show critical findings", "What do you scan for?"],
    };
    const turns: ChatTurn[] = [{ id: "t1", query: "is this scalable", result }];

    const { onSubmit } = renderPanel(turns);

    expect(screen.getByText("Not supported")).toBeTruthy();
    fireEvent.click(screen.getByText("Show critical findings"));
    expect(onSubmit).toHaveBeenCalledWith("Show critical findings");
  });
});
