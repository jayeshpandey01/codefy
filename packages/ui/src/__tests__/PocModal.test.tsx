import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Finding } from "@whoami/types";
import { PocModal } from "../components/PocModal.js";

function buildTestFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-cmd-1",
    ruleId: "js-command-injection-exec",
    status: "confirmed",
    severity: "critical",
    title: "Command Injection in exec",
    description: "Untrusted parameter reaches exec()",
    cwe: "CWE-78",
    createdAt: "2026-08-30T12:00:00.000Z",
    trace: {
      sinkClass: "command-injection",
      steps: [
        {
          role: "source",
          label: "req.body.filename",
          filePath: "app/routes/convert.ts",
          line: 6,
        },
        {
          role: "sink",
          label: "exec(cmd)",
          filePath: "app/routes/convert.ts",
          line: 18,
        },
      ],
    },
    ...overrides,
  };
}

describe("PocModal", () => {
  it("does not render when isOpen is false", () => {
    const handleClose = vi.fn();
    const handleRunPoc = vi.fn();

    render(
      <PocModal
        finding={buildTestFinding()}
        isOpen={false}
        onClose={handleClose}
        onRunPoc={handleRunPoc}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders target vulnerability, probe payload, and action buttons when open", () => {
    const handleClose = vi.fn();
    const handleRunPoc = vi.fn();

    render(
      <PocModal
        finding={buildTestFinding()}
        isOpen={true}
        onClose={handleClose}
        onRunPoc={handleRunPoc}
      />,
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("PoC Verification")).toBeTruthy();
    expect(screen.getByText("Command Injection in exec")).toBeTruthy();
    expect(screen.getByText("OS Command Injection (CWE-78)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run Local PoC" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("calls onClose when Cancel button or X button is clicked", () => {
    const handleClose = vi.fn();
    const handleRunPoc = vi.fn();

    render(
      <PocModal
        finding={buildTestFinding()}
        isOpen={true}
        onClose={handleClose}
        onRunPoc={handleRunPoc}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle("Close PoC Dialog"));
    expect(handleClose).toHaveBeenCalledTimes(2);

    expect(handleRunPoc).not.toHaveBeenCalled();
  });

  it("invokes onRunPoc and displays probe verification confirmation", async () => {
    const handleClose = vi.fn();
    const handleRunPoc = vi.fn().mockResolvedValue({
      verified: true,
      detail: "[PoC Verified] Command execution vector confirmed via probe.",
    });

    render(
      <PocModal
        finding={buildTestFinding()}
        isOpen={true}
        onClose={handleClose}
        onRunPoc={handleRunPoc}
      />,
    );

    const runBtn = screen.getByRole("button", { name: "Run Local PoC" });
    fireEvent.click(runBtn);

    expect(handleRunPoc).toHaveBeenCalledTimes(1);
    expect(handleRunPoc).toHaveBeenCalledWith(
      expect.objectContaining({ id: "finding-cmd-1" }),
    );
  });
});
