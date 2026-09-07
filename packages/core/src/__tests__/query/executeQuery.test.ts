import { describe, expect, it } from "vitest";

import { executeQuery, runChatQuery } from "../../query/executor.js";
import { FIXTURE_FINDINGS } from "./fixtures.js";

describe("executeQuery", () => {
  it("LIST_FINDINGS returns exactly the matching findings, severity-first", () => {
    const result = executeQuery(
      { intent: "LIST_FINDINGS", filter: { status: ["confirmed"] }, rawQuery: "x" },
      FIXTURE_FINDINGS,
    );
    expect(result.capability).toBe("SUPPORTED");
    expect(result.findings.map((f) => f.id)).toEqual([
      "F-10291", // critical
      "remote-recon-1699999999-0", // high
    ]);
  });

  it("FIND_FINDING_BY_ID returns PARTIALLY_SUPPORTED for an unknown id", () => {
    const result = executeQuery(
      { intent: "FIND_FINDING_BY_ID", findingId: "F-does-not-exist", rawQuery: "x" },
      FIXTURE_FINDINGS,
    );
    expect(result.capability).toBe("PARTIALLY_SUPPORTED");
    expect(result.findings).toHaveLength(0);
  });

  it("EXPLAIN_FINDING explains a confirmed finding with no sanitizer step", () => {
    const result = executeQuery(
      { intent: "EXPLAIN_FINDING", findingId: "F-10291", rawQuery: "x" },
      FIXTURE_FINDINGS,
    );
    expect(result.capability).toBe("SUPPORTED");
    expect(result.explanation).toContain("Status: CONFIRMED");
    expect(result.explanation).toContain("No sanitizer step was found");
    expect(result.graphViewMode).toBe("graph");
  });

  it("EXPLAIN_FINDING falls back to options.selectedFindingId when no id is in the question", () => {
    const result = executeQuery(
      { intent: "EXPLAIN_FINDING", rawQuery: "why is this critical" },
      FIXTURE_FINDINGS,
      { selectedFindingId: "F-2001" },
    );
    expect(result.capability).toBe("SUPPORTED");
    expect(result.findings[0]?.id).toBe("F-2001");
    expect(result.graphViewMode).toBe("control_flow"); // has a sanitizer step
  });

  it("LIST_FILES_WITH_FINDINGS is PARTIALLY_SUPPORTED when no workspace graph is loaded", () => {
    const result = executeQuery(
      { intent: "LIST_FILES_WITH_FINDINGS", rawQuery: "x" },
      FIXTURE_FINDINGS,
    );
    expect(result.capability).toBe("PARTIALLY_SUPPORTED");
  });

  it("FIND_RULE_COVERAGE reports the real 5-rule count, honestly listing gaps", () => {
    const result = executeQuery(
      { intent: "FIND_RULE_COVERAGE", rawQuery: "x" },
      FIXTURE_FINDINGS,
    );
    expect(result.capability).toBe("SUPPORTED");
    expect(result.explanation).toContain("5 rule(s)");
    expect(result.explanation).toContain("Not yet implemented");
  });

  it("FIND_RULE_COVERAGE also describes the orchestrator's remote scan profiles, not just local rules", () => {
    const result = executeQuery(
      { intent: "FIND_RULE_COVERAGE", rawQuery: "x" },
      FIXTURE_FINDINGS, // includes one scope: "orchestrator" fixture finding
    );
    expect(result.explanation).toContain("Remote authorized scanning");
    expect(result.explanation).toContain("vuln-assessment (nuclei)");
    expect(result.explanation).toContain("1 orchestrator finding(s) already in this scan.");
  });

  it("FIND_RULE_COVERAGE says no orchestrator scan has run yet when there are no orchestrator findings", () => {
    const localOnly = FIXTURE_FINDINGS.filter((f) => f.scope !== "orchestrator");
    const result = executeQuery(
      { intent: "FIND_RULE_COVERAGE", rawQuery: "x" },
      localOnly,
    );
    expect(result.explanation).toContain("No orchestrator scan has been run in this session yet.");
  });

  it("SCAN_SUMMARY never claims the repository is secure, and reports real counts", () => {
    const result = executeQuery(
      { intent: "SCAN_SUMMARY", rawQuery: "x" },
      FIXTURE_FINDINGS,
    );
    expect(result.explanation).not.toMatch(/secure/i);
    expect(result.explanation).toContain("2 confirmed");
  });
});

describe("runChatQuery", () => {
  it("returns UNSUPPORTED for a question with no matching intent, never guessing", () => {
    const result = runChatQuery("is this architecture scalable", FIXTURE_FINDINGS);
    expect(result.capability).toBe("UNSUPPORTED");
    expect(result.suggestions?.length).toBeGreaterThan(0);
  });

  it("suggestions never reference a made-up finding id — real ids are filePath:line:ruleId, too long to guess", () => {
    const result = runChatQuery("is this architecture scalable", FIXTURE_FINDINGS);
    expect(result.suggestions?.some((s) => s.includes("F-10291"))).toBe(false);
    expect(result.suggestions).toContain("Why is this confirmed?");
  });

  it("suggestions reflect the real severities present in this scan, not a hardcoded one", () => {
    const onlyLow = [FIXTURE_FINDINGS.find((f) => f.severity === "low")!];
    const result = runChatQuery("asdf", onlyLow);
    expect(result.suggestions).toContain("Show low findings");
  });

  it('resolves a pasted real-shaped id (e.g. "api/users.py:42:some-rule") via substring match, not just exact equality', () => {
    const realShapedFindings = [
      { ...FIXTURE_FINDINGS[0]!, id: "api/users.py:42:js-sql-injection-string-concat" },
    ];
    const result = runChatQuery(
      "why is api/users.py:42:js-sql-injection-string-concat confirmed?",
      realShapedFindings,
    );
    expect(result.capability).toBe("SUPPORTED");
    expect(result.findings[0]?.id).toBe("api/users.py:42:js-sql-injection-string-concat");
  });

  it("compiles and executes end-to-end for a supported question", () => {
    const result = runChatQuery("show critical bugs", FIXTURE_FINDINGS);
    expect(result.capability).toBe("SUPPORTED");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.id).toBe("F-10291");
  });
});
