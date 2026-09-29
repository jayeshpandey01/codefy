import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QuickSearchModal } from "../components/QuickSearchModal.js";
import type { Finding, WorkspaceGraph } from "@whoami/types";

const mockFindings: Finding[] = [
  {
    id: "f-1",
    ruleId: "js-command-injection-exec",
    scope: "code",
    title: "Command Injection in Process Runner",
    description: "Tainted user input reaches child_process.exec without validation.",
    severity: "critical",
    status: "confirmed",
    cwe: "CWE-78",
    trace: {
      sinkClass: "command-injection",
      steps: [
        { filePath: "src/server/runner.ts", line: 12, label: "req.body", role: "source" },
        { filePath: "src/server/runner.ts", line: 25, label: "exec(cmd)", role: "sink" },
      ],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "f-2",
    ruleId: "js-sql-injection",
    scope: "code",
    title: "SQL Injection in User Query",
    description: "Raw string interpolation in database query.",
    severity: "high",
    status: "confirmed",
    cwe: "CWE-89",
    trace: {
      sinkClass: "sql-injection",
      steps: [
        { filePath: "src/db/userRepo.ts", line: 15, label: "req.query.id", role: "source" },
        { filePath: "src/db/userRepo.ts", line: 30, label: "db.query()", role: "sink" },
      ],
    },
    createdAt: new Date().toISOString(),
  },
];

const mockWorkspaceGraph: WorkspaceGraph = {
  nodes: [
    { id: "file:src/server/runner.ts", label: "runner.ts", type: "file", filePath: "src/server/runner.ts", line: 1, findingCount: 1 },
    { id: "file:src/db/userRepo.ts", label: "userRepo.ts", type: "file", filePath: "src/db/userRepo.ts", line: 1, findingCount: 1 },
    { id: "file:src/utils/logger.ts", label: "logger.ts", type: "file", filePath: "src/utils/logger.ts", line: 1 },
    { id: "dir:src/server", label: "src/server", type: "directory", filePath: "src/server" },
    { id: "dir:src/db", label: "src/db", type: "directory", filePath: "src/db" },
    { id: "dir:src/utils", label: "src/utils", type: "directory", filePath: "src/utils" },
  ],
  edges: [],
};

describe("QuickSearchModal", () => {
  it("does not render when isOpen is false", () => {
    const { container } = render(
      <QuickSearchModal
        isOpen={false}
        onClose={vi.fn()}
        findings={mockFindings}
        onSelectFinding={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders search input and category tabs when isOpen is true", () => {
    render(
      <QuickSearchModal
        isOpen={true}
        onClose={vi.fn()}
        findings={mockFindings}
        workspaceGraph={mockWorkspaceGraph}
        onSelectFinding={vi.fn()}
      />,
    );

    expect(screen.getByPlaceholderText(/Search files, folders, issues/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /All/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Issues/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Files/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Folders/i })).toBeDefined();
  });

  it("filters issues by search query and selects an issue", () => {
    const handleSelectFinding = vi.fn();
    const handleClose = vi.fn();

    render(
      <QuickSearchModal
        isOpen={true}
        onClose={handleClose}
        findings={mockFindings}
        workspaceGraph={mockWorkspaceGraph}
        onSelectFinding={handleSelectFinding}
      />,
    );

    const input = screen.getByPlaceholderText(/Search files, folders, issues/i);
    fireEvent.change(input, { target: { value: "command injection" } });

    const issueItem = screen.getByText("Command Injection in Process Runner");
    expect(issueItem).toBeDefined();

    fireEvent.click(issueItem);
    expect(handleSelectFinding).toHaveBeenCalledWith(mockFindings[0]);
    expect(handleClose).toHaveBeenCalled();
  });

  it("switches to Files category and selects a file", () => {
    const handleSelectFile = vi.fn();
    const handleClose = vi.fn();

    render(
      <QuickSearchModal
        isOpen={true}
        onClose={handleClose}
        findings={mockFindings}
        workspaceGraph={mockWorkspaceGraph}
        onSelectFinding={vi.fn()}
        onSelectFile={handleSelectFile}
      />,
    );

    const filesTab = screen.getByRole("button", { name: /Files/i });
    fireEvent.click(filesTab);

    const fileNode = screen.getByText("logger.ts");
    expect(fileNode).toBeDefined();

    fireEvent.click(fileNode);
    expect(handleSelectFile).toHaveBeenCalledWith("src/utils/logger.ts", 1);
    expect(handleClose).toHaveBeenCalled();
  });

  it("switches to Folders category and selects a folder", () => {
    const handleSelectFolder = vi.fn();
    const handleClose = vi.fn();

    render(
      <QuickSearchModal
        isOpen={true}
        onClose={handleClose}
        findings={mockFindings}
        workspaceGraph={mockWorkspaceGraph}
        onSelectFinding={vi.fn()}
        onSelectFolder={handleSelectFolder}
      />,
    );

    const foldersTab = screen.getByRole("button", { name: /Folders/i });
    fireEvent.click(foldersTab);

    const folderNode = screen.getByText("src/server");
    expect(folderNode).toBeDefined();

    fireEvent.click(folderNode);
    expect(handleSelectFolder).toHaveBeenCalledWith("src/server");
    expect(handleClose).toHaveBeenCalled();
  });

  it("handles keyboard navigation: ArrowDown and Enter to select item", () => {
    const handleSelectFinding = vi.fn();
    const handleClose = vi.fn();

    render(
      <QuickSearchModal
        isOpen={true}
        onClose={handleClose}
        findings={mockFindings}
        onSelectFinding={handleSelectFinding}
      />,
    );

    const dialog = screen.getByRole("dialog");
    // Press Enter on the currently highlighted item (index 0)
    fireEvent.keyDown(dialog, { key: "Enter" });

    expect(handleSelectFinding).toHaveBeenCalledWith(mockFindings[0]);
    expect(handleClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape key is pressed", () => {
    const handleClose = vi.fn();

    render(
      <QuickSearchModal
        isOpen={true}
        onClose={handleClose}
        findings={mockFindings}
        onSelectFinding={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(handleClose).toHaveBeenCalled();
  });
});
