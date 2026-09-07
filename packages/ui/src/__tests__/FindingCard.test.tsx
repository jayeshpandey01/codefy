import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Finding } from "@whoami/types";
import { FindingCard } from "../components/FindingCard.js";
import { BridgeProvider } from "../bridge/BridgeContext.js";
import { MockBridgeClient } from "../bridge/MockBridgeClient.js";

function buildFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-1",
    ruleId: "js-sql-injection-string-concat",
    status: "confirmed",
    severity: "critical",
    title: "SQL injection via unsanitized request parameter",
    description:
      "req.params.id flows into a raw SQL string with no sanitizer on the path.",
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
    ...overrides,
  };
}

describe("FindingCard", () => {
  it("renders severity, status, title, and CWE", () => {
    const bridge = new MockBridgeClient();
    render(
      <BridgeProvider client={bridge}>
        <FindingCard finding={buildFinding()} />
      </BridgeProvider>,
    );

    expect(screen.getByText("Critical")).toBeTruthy();
    expect(screen.getByText("Confirmed")).toBeTruthy();
    expect(
      screen.getByText("SQL injection via unsanitized request parameter"),
    ).toBeTruthy();
    expect(screen.getByText("CWE-89")).toBeTruthy();
  });

  it('sends a jump-to-line message via the bridge when "Jump to Line" is clicked', () => {
    const bridge = new MockBridgeClient();
    render(
      <BridgeProvider client={bridge}>
        <FindingCard finding={buildFinding()} />
      </BridgeProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Jump to Line" }));

    expect(bridge.sent).toHaveLength(1);
    expect(bridge.sent[0]).toMatchObject({
      type: "jump-to-line",
      filePath: "src/db/client.ts",
      line: 30,
    });
  });

  it('opens DiffPreviewModal when "Apply Fix" is clicked and sends bridge message upon modal confirmation', () => {
    const bridge = new MockBridgeClient();
    render(
      <BridgeProvider client={bridge}>
        <FindingCard finding={buildFinding()} />
      </BridgeProvider>,
    );

    // Initial state: modal dialog is not open
    expect(screen.queryByRole("dialog")).toBeNull();

    // Click Apply Fix button on card
    fireEvent.click(screen.getByRole("button", { name: "Apply Fix" }));

    // Modal dialog is now open
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Proposed Fix (Changes)")).toBeTruthy();

    // Confirm Apply Fix inside modal
    const modalApplyBtn = screen.getAllByRole("button", { name: "Apply Fix" })[1];
    expect(modalApplyBtn).toBeTruthy();
    fireEvent.click(modalApplyBtn!);

    expect(bridge.sent).toHaveLength(1);
    expect(bridge.sent[0]).toMatchObject({
      type: "apply-fix-request",
      findingId: "finding-1",
    });
  });

  it('opens PocModal when "Run Local PoC" is clicked and triggers probe execution', async () => {
    const bridge = new MockBridgeClient();
    render(
      <BridgeProvider client={bridge}>
        <FindingCard finding={buildFinding()} />
      </BridgeProvider>,
    );

    // Initial state: modal dialog is not open
    expect(screen.queryByRole("dialog")).toBeNull();

    // Click Run Local PoC button on card
    fireEvent.click(screen.getByRole("button", { name: "Run Local PoC" }));

    // Modal dialog is now open
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("PoC Verification")).toBeTruthy();

    // Click Run Local PoC inside modal
    const modalRunBtn = screen.getAllByRole("button", { name: "Run Local PoC" })[1];
    expect(modalRunBtn).toBeTruthy();
    fireEvent.click(modalRunBtn!);

    expect(bridge.sent).toHaveLength(1);
    expect(bridge.sent[0]).toMatchObject({
      type: "run-poc-request",
      findingId: "finding-1",
    });
  });

  it("throws if rendered without a BridgeProvider", () => {
    // Swallow the expected React error-boundary console noise for this assertion.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<FindingCard finding={buildFinding()} />)).toThrow(
      /BridgeProvider/,
    );
    spy.mockRestore();
  });
});
