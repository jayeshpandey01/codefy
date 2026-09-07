import { describe, expect, it } from "vitest";
import type { QueryAST } from "@whoami/types";

import { pickGraphViewMode } from "../../query/graph-view-picker.js";
import { FIXTURE_FINDINGS } from "./fixtures.js";

const findingById = (id: string) => FIXTURE_FINDINGS.find((f) => f.id === id)!;

describe("pickGraphViewMode", () => {
  it("SHOW_GRAPH_PATH always opens the data-flow DAG", () => {
    const ast: QueryAST = { intent: "SHOW_GRAPH_PATH", rawQuery: "x" };
    expect(pickGraphViewMode(ast, findingById("F-10291"))).toBe("graph");
  });

  it("EXPLAIN_FINDING on a finding whose trace has a sanitizer step opens control flow", () => {
    const ast: QueryAST = { intent: "EXPLAIN_FINDING", rawQuery: "x" };
    expect(pickGraphViewMode(ast, findingById("F-2001"))).toBe("control_flow");
  });

  it("EXPLAIN_FINDING on a finding with no sanitizer step falls back to the data-flow DAG", () => {
    const ast: QueryAST = { intent: "EXPLAIN_FINDING", rawQuery: "x" };
    expect(pickGraphViewMode(ast, findingById("F-10291"))).toBe("graph");
  });

  it("an orchestrator-scoped finding always opens the remote attack surface view", () => {
    const ast: QueryAST = { intent: "LIST_FINDINGS", rawQuery: "x" };
    expect(pickGraphViewMode(ast, findingById("remote-recon-1699999999-0"))).toBe(
      "remote",
    );
  });

  it('a question mentioning "dependency" opens the supply chain view', () => {
    const ast: QueryAST = { intent: "LIST_FINDINGS", rawQuery: "what depends on lodash" };
    expect(pickGraphViewMode(ast, findingById("F-10291"))).toBe("supply_chain");
  });

  it('a question mentioning "impact"/"affect" opens the blast radius view', () => {
    const ast: QueryAST = { intent: "LIST_FINDINGS", rawQuery: "what else does this affect" };
    expect(pickGraphViewMode(ast, findingById("F-10291"))).toBe("blast_radius");
  });

  it("defaults to the data-flow DAG with no finding and no keyword match", () => {
    const ast: QueryAST = { intent: "LIST_FINDINGS", rawQuery: "show critical bugs" };
    expect(pickGraphViewMode(ast)).toBe("graph");
  });
});
