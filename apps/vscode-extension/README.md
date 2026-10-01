# WhoAmI (Codefy) — Security Intelligence for VS Code

WhoAmI is a developer-first security intelligence and taint-flow static analysis extension for Visual Studio Code. It detects real-time vulnerabilities, traces end-to-end dataflow paths, visualizes blast radiuses in an interactive architecture graph, and provides one-click real code remediation directly in your workspace.

---

## Features

### Real-Time Static & Taint-Flow Analysis
- **In-process AST Analysis**: Powered by `web-tree-sitter` and `ast-grep`.
- **Zero-Latency Local Scans**: Scans your active workspace locally without sending confidential source code to external servers.
- **Deduplicated Finding Engine**: Grouped and ranked findings across CWEs:
  - Hardcoded Secrets & API Keys (CWE-798)
  - SQL Injection & Parameterized Query Enforcement (CWE-89)
  - Remote Command Injection (CWE-78)
  - Path Traversal & Arbitrary File Access (CWE-22)
  - Code Injection & Unsafe Eval (CWE-94)
  - Server-Side Request Forgery / SSRF (CWE-918)
  - JSX / TypeScript Syntax & Parser Errors

### Interactive Diff Preview & One-Click Fixes
- **Real File Context**: Inspect side-by-side or unified diffs showing your actual workspace file content (±5 context lines around the vulnerability).
- **Automated Fix Transformations**: Apply safe sanitizers, parameterized query wrappers, secret redactions, or URL whitelists with one click.
- **Horizontal & Vertical Pane Scrolling**: View long lines and complex expressions without truncation.

### Interconnected Architecture & Attack Graph
- Interactive visual graph view showing taint traces, entry points, sanitizers, and sinks.
- Blast radius inspection and dependency visualization.

### Multi-Format Reporting & Verification
- Export comprehensive security audit reports in **PDF**, **HTML**, **JSON**, and **SARIF** standards.
- Run local proof-of-concept verification (PoC) to validate vulnerabilities before committing.

---

## Getting Started

1. Open a workspace or folder in VS Code.
2. Click the **Codefy Shield Icon** on the left Activity Bar (Primary Side Bar), or click the shield icon in the status bar / editor title bar.
3. Click **Scan Workspace** to analyze your code.
4. Click on any finding to jump to the code line, preview the attack trace, or click **Apply Fix** to review the diff and apply the fix.

---

## License

Private & Proprietary. Copyright © Codefy / WhoAmI.
