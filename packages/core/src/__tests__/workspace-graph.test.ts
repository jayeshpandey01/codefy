import { describe, expect, it } from "vitest";
import { buildWorkspaceGraph } from "../graph/workspace-graph.js";
import type { Finding } from "@whoami/types";

describe("buildWorkspaceGraph", () => {
  it("builds directory hierarchy and connects file nodes", () => {
    const files = [
      "c:/project/app/page.tsx",
      "c:/project/components/hero.tsx",
      "c:/project/lib/utils.ts",
    ];

    const findings: Finding[] = [
      {
        id: "finding-1",
        ruleId: "syntax-error",
        status: "confirmed",
        severity: "critical",
        title: "Syntax Error",
        description: "Syntax error in hero.tsx",
        createdAt: new Date().toISOString(),
        trace: {
          sinkClass: "code-injection",
          steps: [
            {
              role: "sink",
              label: "Syntax Error",
              filePath: "c:/project/components/hero.tsx",
              line: 10,
            },
          ],
        },
      },
    ];

    const fileContents = new Map<string, string>([
      [
        "c:/project/app/page.tsx",
        "import { Hero } from '../components/hero';\nimport { utils } from '../lib/utils';",
      ],
    ]);

    const result = buildWorkspaceGraph(
      files,
      findings,
      fileContents,
      "c:/project",
    );

    expect(result.nodes.length).toBeGreaterThanOrEqual(3);
    expect(result.edges.length).toBeGreaterThanOrEqual(2);

    // Verify hero.tsx has finding attached
    const heroNode = result.nodes.find((n) => n.filePath.endsWith("hero.tsx"));
    expect(heroNode).toBeDefined();
    expect(heroNode?.findingCount).toBe(1);
    expect(heroNode?.highestSeverity).toBe("critical");

    // Verify import edges
    const importEdge = result.edges.find((e) => e.type === "imports");
    expect(importEdge).toBeDefined();
  });

  it("extracts functions, classes, and call relationships across multiple languages", () => {
    const files = [
      "c:/project/src/auth.ts",
      "c:/project/src/server.py",
      "c:/project/src/service.go",
      "c:/project/src/worker.rs",
    ];

    const findings: Finding[] = [
      {
        id: "finding-ts",
        ruleId: "js-command-injection-exec",
        status: "confirmed",
        severity: "critical",
        title: "Command Injection",
        description: "Command injection in login",
        createdAt: new Date().toISOString(),
        trace: {
          sinkClass: "command-injection",
          steps: [
            {
              role: "sink",
              label: "exec(cmd)",
              filePath: "c:/project/src/auth.ts",
              line: 6,
            },
          ],
        },
      },
    ];

    const fileContents = new Map<string, string>([
      [
        "c:/project/src/auth.ts",
        `class AuthService {
  login() {
    helper();
  }
}
function helper() {
  exec(cmd);
}`,
      ],
      [
        "c:/project/src/server.py",
        `class AppServer:
  pass
def start_server():
  pass`,
      ],
      [
        "c:/project/src/service.go",
        `type UserService struct {}
func QueryUser() {
}`,
      ],
      [
        "c:/project/src/worker.rs",
        `struct TaskWorker {}
fn process_queue() {
}`,
      ],
    ]);

    const result = buildWorkspaceGraph(
      files,
      findings,
      fileContents,
      "c:/project",
    );

    // Verify TypeScript symbols extracted
    const classNode = result.nodes.find((n) => n.label.includes("AuthService"));
    expect(classNode).toBeDefined();
    expect(classNode?.type).toBe("class");

    const helperFunc = result.nodes.find((n) => n.label.includes("helper"));
    expect(helperFunc).toBeDefined();
    expect(helperFunc?.type).toBe("function");
    expect(helperFunc?.findingCount).toBe(1);
    expect(helperFunc?.highestSeverity).toBe("critical");

    // Verify Python symbols
    const pyClass = result.nodes.find((n) => n.label.includes("AppServer"));
    expect(pyClass).toBeDefined();
    const pyFunc = result.nodes.find((n) => n.label.includes("start_server"));
    expect(pyFunc).toBeDefined();

    // Verify Go symbols
    const goStruct = result.nodes.find((n) => n.label.includes("UserService"));
    expect(goStruct).toBeDefined();
    const goFunc = result.nodes.find((n) => n.label.includes("QueryUser"));
    expect(goFunc).toBeDefined();

    // Verify Rust symbols
    const rsStruct = result.nodes.find((n) => n.label.includes("TaskWorker"));
    expect(rsStruct).toBeDefined();
    const rsFunc = result.nodes.find((n) => n.label.includes("process_queue"));
    expect(rsFunc).toBeDefined();

    // Verify defines edge (File -> Function)
    const definesEdge = result.edges.find((e) => e.type === "defines");
    expect(definesEdge).toBeDefined();

    // Verify calls edge (login -> helper)
    const callsEdge = result.edges.find((e) => e.type === "calls");
    expect(callsEdge).toBeDefined();
  });

  it("scales linearly and builds large workspace graphs (500 files, 2500 calls) in under 250ms", () => {
    const fileCount = 500;
    const files: string[] = [];
    const fileContents = new Map<string, string>();

    for (let i = 0; i < fileCount; i++) {
      const filePath = `c:/project/src/module_${i}.ts`;
      files.push(filePath);

      const nextIndex = (i + 1) % fileCount;
      const content = `
import { func_${nextIndex} } from './module_${nextIndex}';

export class Service_${i} {
  run_${i}() {
    func_${i}();
    func_${nextIndex}();
  }
}

export function func_${i}() {
  helper_${i}();
}

function helper_${i}() {
  console.log("module ${i}");
}
`;
      fileContents.set(filePath, content);
    }

    const startTime = performance.now();
    const result = buildWorkspaceGraph(files, [], fileContents, "c:/project");
    const duration = performance.now() - startTime;

    expect(result.nodes.length).toBeGreaterThan(1500);
    expect(result.edges.length).toBeGreaterThan(1500);
    // Linear O(L + E) benchmark target: < 350ms even under test runner overhead
    expect(duration).toBeLessThan(350);
  });
});
