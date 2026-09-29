import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Finding } from "@whoami/types";
import { DiffPreviewModal } from "../components/DiffPreviewModal.js";

function buildTestFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: "finding-sql-1",
    ruleId: "js-sql-injection-string-concat",
    status: "confirmed",
    severity: "critical",
    title: "SQL injection in query",
    description: "Raw SQL query uses unsanitized userId",
    cwe: "CWE-89",
    createdAt: "2026-08-30T12:00:00.000Z",
    trace: {
      sinkClass: "sql-injection",
      steps: [
        {
          role: "source",
          label: "req.params.id",
          filePath: "app/routes/profile.ts",
          line: 4,
        },
        {
          role: "sink",
          label: "db.query(sql)",
          filePath: "app/routes/profile.ts",
          line: 12,
        },
      ],
    },
    ...overrides,
  };
}

describe("DiffPreviewModal", () => {
  it("does not render when isOpen is false", () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    render(
      <DiffPreviewModal
        finding={buildTestFinding()}
        isOpen={false}
        onClose={handleClose}
        onApplyFix={handleApply}
      />,
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders breadcrumbs, title, side-by-side diff headers, and action buttons when open", () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    render(
      <DiffPreviewModal
        finding={buildTestFinding()}
        isOpen={true}
        onClose={handleClose}
        onApplyFix={handleApply}
      />,
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("SQL injection in query")).toBeTruthy();
    expect(screen.getByText("Original Code (Previous)")).toBeTruthy();
    expect(screen.getByText("Proposed Fix (Changes)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Apply Fix" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("calls onClose when Cancel button or X button is clicked", () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    render(
      <DiffPreviewModal
        finding={buildTestFinding()}
        isOpen={true}
        onClose={handleClose}
        onApplyFix={handleApply}
      />,
    );

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelButton);
    expect(handleClose).toHaveBeenCalledTimes(1);

    const closeXButton = screen.getByTitle("Cancel and close diff viewer");
    fireEvent.click(closeXButton);
    expect(handleClose).toHaveBeenCalledTimes(2);

    expect(handleApply).not.toHaveBeenCalled();
  });

  it("invokes onApplyFix when Apply Fix button is clicked", async () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn().mockResolvedValue(true);

    render(
      <DiffPreviewModal
        finding={buildTestFinding()}
        isOpen={true}
        onClose={handleClose}
        onApplyFix={handleApply}
      />,
    );

    const applyButton = screen.getByRole("button", { name: "Apply Fix" });
    fireEvent.click(applyButton);

    expect(handleApply).toHaveBeenCalledTimes(1);
    expect(handleApply).toHaveBeenCalledWith(
      expect.objectContaining({ id: "finding-sql-1" }),
    );
  });

  it("allows toggling between Split and Unified view mode", () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    render(
      <DiffPreviewModal
        finding={buildTestFinding()}
        isOpen={true}
        onClose={handleClose}
        onApplyFix={handleApply}
      />,
    );

    const unifiedBtn = screen.getByTitle("Unified Inline View");
    fireEvent.click(unifiedBtn);

    expect(screen.getByText("Unified Changes View")).toBeTruthy();

    const splitBtn = screen.getByTitle("Side-by-side Split View");
    fireEvent.click(splitBtn);

    expect(screen.getByText("Original Code (Previous)")).toBeTruthy();
  });

  it("calls onClose when clicking outside on the backdrop", () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    render(
      <DiffPreviewModal
        finding={buildTestFinding()}
        isOpen={true}
        onClose={handleClose}
        onApplyFix={handleApply}
      />,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when pressing the Escape key", () => {
    const handleClose = vi.fn();
    const handleApply = vi.fn();

    render(
      <DiffPreviewModal
        finding={buildTestFinding()}
        isOpen={true}
        onClose={handleClose}
        onApplyFix={handleApply}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
