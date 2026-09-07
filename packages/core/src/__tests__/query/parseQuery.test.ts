import { describe, expect, it } from "vitest";

import { parseQuery } from "../../query/intent.js";

describe("parseQuery", () => {
  it('maps "show critical bugs" to LIST_FINDINGS filtered by severity', () => {
    const ast = parseQuery("show critical bugs");
    expect(ast).toEqual({
      intent: "LIST_FINDINGS",
      filter: { severity: ["critical"] },
      rawQuery: "show critical bugs",
    });
  });

  it('maps "any sql injection?" to LIST_FINDINGS filtered by sinkClass, without the word "bug"', () => {
    const ast = parseQuery("any sql injection?");
    expect(ast?.intent).toBe("LIST_FINDINGS");
    expect(ast?.filter?.sinkClass).toBe("sql-injection");
  });

  it('maps "why is F-10291 confirmed" to EXPLAIN_FINDING with the extracted id', () => {
    const ast = parseQuery("why is F-10291 confirmed");
    expect(ast).toEqual({
      intent: "EXPLAIN_FINDING",
      findingId: "F-10291",
      rawQuery: "why is F-10291 confirmed",
    });
  });

  it('maps "show me the path for F-10291" to SHOW_GRAPH_PATH with the extracted id', () => {
    const ast = parseQuery("show me the path for F-10291");
    expect(ast?.intent).toBe("SHOW_GRAPH_PATH");
    expect(ast?.findingId).toBe("F-10291");
  });

  it('maps "do you check for xss" to FIND_RULE_COVERAGE', () => {
    const ast = parseQuery("do you check for xss");
    expect(ast).toEqual({
      intent: "FIND_RULE_COVERAGE",
      rawQuery: "do you check for xss",
    });
  });

  it('maps "which files have issues" to LIST_FILES_WITH_FINDINGS', () => {
    expect(parseQuery("which files have issues")?.intent).toBe(
      "LIST_FILES_WITH_FINDINGS",
    );
  });

  it('maps "how many issues did we find" to SCAN_SUMMARY', () => {
    expect(parseQuery("how many issues did we find")?.intent).toBe(
      "SCAN_SUMMARY",
    );
  });

  it('maps a bare finding id ("show me F-10291") to FIND_FINDING_BY_ID', () => {
    const ast = parseQuery("show me F-10291");
    expect(ast?.intent).toBe("FIND_FINDING_BY_ID");
    expect(ast?.findingId).toBe("F-10291");
  });

  it("returns undefined (UNSUPPORTED) for an unmappable question", () => {
    expect(parseQuery("is this architecture scalable")).toBeUndefined();
  });

  it("returns undefined for empty input", () => {
    expect(parseQuery("   ")).toBeUndefined();
  });
});
