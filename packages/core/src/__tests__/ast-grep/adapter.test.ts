import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createAstGrepAdapter } from "../../ast-grep/index.js";
import {
  JS_COMMAND_INJECTION_EXEC_RULE,
  JS_SQL_INJECTION_STRING_CONCAT_RULE,
  JS_SSRF_UNVALIDATED_URL_RULE,
} from "../../rules/registry.js";

function readFixture(relativePath: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(`../fixtures/javascript/${relativePath}`, import.meta.url),
    ),
    "utf8",
  );
}

describe("createAstGrepAdapter (whoami-node condition -> AstGrepNapiAdapter)", () => {
  it("returns a working IAstGrepAdapter backed by @ast-grep/napi", async () => {
    const adapter = createAstGrepAdapter();
    expect(adapter).toBeDefined();
    expect(typeof adapter.findMatches).toBe("function");
    await adapter.initialize?.();
  });

  it("finds a command-injection match in the vulnerable fixture", () => {
    const adapter = createAstGrepAdapter();
    const source = readFixture("js-command-injection-exec/vulnerable.ts");

    const matches = adapter.findMatches(source, JS_COMMAND_INJECTION_EXEC_RULE);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.ruleId).toBe("js-command-injection-exec");
    expect(matches[0]?.captures.CMD).toBe("cmd");
    expect(matches[0]?.matchText).toContain("child_process.exec(cmd");
  });

  it("finds no match in the command-injection safe fixture (execFile, argv array)", () => {
    const adapter = createAstGrepAdapter();
    const source = readFixture("js-command-injection-exec/safe.ts");

    const matches = adapter.findMatches(source, JS_COMMAND_INJECTION_EXEC_RULE);

    expect(matches).toHaveLength(0);
  });

  it("finds a sql-injection match in the vulnerable fixture", () => {
    const adapter = createAstGrepAdapter();
    const source = readFixture("js-sql-injection-string-concat/vulnerable.ts");

    const matches = adapter.findMatches(
      source,
      JS_SQL_INJECTION_STRING_CONCAT_RULE,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.captures.QUERY).toContain("${id}");
  });

  it("finds no match in the sql-injection safe fixture (parameterized placeholder)", () => {
    const adapter = createAstGrepAdapter();
    const source = readFixture("js-sql-injection-string-concat/safe.ts");

    const matches = adapter.findMatches(
      source,
      JS_SQL_INJECTION_STRING_CONCAT_RULE,
    );

    expect(matches).toHaveLength(0);
  });

  it("finds an ssrf match in both the vulnerable and safe fixtures (ast-grep alone cannot discriminate)", () => {
    const adapter = createAstGrepAdapter();

    const vulnerable = adapter.findMatches(
      readFixture("js-ssrf-unvalidated-url/vulnerable.ts"),
      JS_SSRF_UNVALIDATED_URL_RULE,
    );
    const safe = adapter.findMatches(
      readFixture("js-ssrf-unvalidated-url/safe.ts"),
      JS_SSRF_UNVALIDATED_URL_RULE,
    );

    expect(vulnerable).toHaveLength(1);
    expect(vulnerable[0]?.captures.URL).toBe("url");
    expect(safe).toHaveLength(1);
    expect(safe[0]?.captures.URL).toBe("url");
  });
});
