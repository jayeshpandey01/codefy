import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { CandidatePath } from "@whoami/types";
import { beforeEach, describe, expect, it } from "vitest";

import { createAstGrepAdapter } from "../../ast-grep/index.js";
import { DeterministicOnlyProvider } from "../../llm/deterministic-only.provider.js";
import { __clearParseCacheForTests } from "../../parser/parser-cache.js";
import {
  JS_COMMAND_INJECTION_EXEC_RULE,
  JS_SQL_INJECTION_STRING_CONCAT_RULE,
  JS_SSRF_UNVALIDATED_URL_RULE,
  JS_PATH_TRAVERSAL_RULE,
  JS_CODE_INJECTION_RULE,
} from "../../rules/registry.js";
import { resolveSanitizerStatus } from "../../taint/sanitizer-filter.js";
import { buildCandidatePaths } from "../../taint/propagate.js";
import { getSinkRuleBinding } from "../../taint/sinks.js";

function readFixture(relativePath: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(`../fixtures/javascript/${relativePath}`, import.meta.url),
    ),
    "utf8",
  );
}

interface FixturePair {
  readonly name: string;
  readonly ruleYaml: string;
  readonly ruleId: string;
  readonly vulnerableFile: string;
  readonly safeFile: string;
}

const FIXTURE_PAIRS: readonly FixturePair[] = [
  {
    name: "command injection",
    ruleYaml: JS_COMMAND_INJECTION_EXEC_RULE,
    ruleId: "js-command-injection-exec",
    vulnerableFile: "js-command-injection-exec/vulnerable.ts",
    safeFile: "js-command-injection-exec/safe.ts",
  },
  {
    name: "sql injection",
    ruleYaml: JS_SQL_INJECTION_STRING_CONCAT_RULE,
    ruleId: "js-sql-injection-string-concat",
    vulnerableFile: "js-sql-injection-string-concat/vulnerable.ts",
    safeFile: "js-sql-injection-string-concat/safe.ts",
  },
  {
    name: "ssrf",
    ruleYaml: JS_SSRF_UNVALIDATED_URL_RULE,
    ruleId: "js-ssrf-unvalidated-url",
    vulnerableFile: "js-ssrf-unvalidated-url/vulnerable.ts",
    safeFile: "js-ssrf-unvalidated-url/safe.ts",
  },
  {
    name: "path traversal",
    ruleYaml: JS_PATH_TRAVERSAL_RULE,
    ruleId: "js-path-traversal",
    vulnerableFile: "js-path-traversal/vulnerable.ts",
    safeFile: "js-path-traversal/safe.ts",
  },
  {
    name: "code injection",
    ruleYaml: JS_CODE_INJECTION_RULE,
    ruleId: "js-code-injection",
    vulnerableFile: "js-code-injection/vulnerable.ts",
    safeFile: "js-code-injection/safe.ts",
  },
];

async function buildPathsFor(
  ruleYaml: string,
  ruleId: string,
  filePath: string,
  sourceCode: string,
): Promise<CandidatePath[]> {
  const adapter = createAstGrepAdapter();
  const matches = adapter.findMatches(sourceCode, ruleYaml);
  const binding = getSinkRuleBinding(ruleId);
  if (!binding) throw new Error(`no SinkRuleBinding registered for ${ruleId}`);
  return buildCandidatePaths({ filePath, sourceCode, binding, matches });
}

describe("resolveSanitizerStatus (using DeterministicOnlyProvider — never real network)", () => {
  const llmProvider = new DeterministicOnlyProvider();

  beforeEach(() => {
    __clearParseCacheForTests();
  });

  for (const pair of FIXTURE_PAIRS) {
    describe(pair.name, () => {
      it("resolves the vulnerable fixture to exactly one confirmed candidate path", async () => {
        const source = readFixture(pair.vulnerableFile);
        const paths = await buildPathsFor(
          pair.ruleYaml,
          pair.ruleId,
          `fixtures/${pair.vulnerableFile}`,
          source,
        );

        expect(paths).toHaveLength(1);
        const status = await resolveSanitizerStatus(paths[0]!, llmProvider);
        expect(status).toBe("confirmed");

        // Every Finding must carry its full trace, not just the endpoints.
        expect(paths[0]!.steps[0]?.role).toBe("source");
        expect(paths[0]!.steps.at(-1)?.role).toBe("sink");
      });

      it("produces zero confirmed/needs-verification findings for the safe fixture", async () => {
        const source = readFixture(pair.safeFile);
        const paths = await buildPathsFor(
          pair.ruleYaml,
          pair.ruleId,
          `fixtures/${pair.safeFile}`,
          source,
        );

        // Either ast-grep never matched the safe shape at all (command
        // injection / sql injection), or it matched but the sanitizer
        // filter discards it (ssrf) — either way, zero Findings result.
        const statuses = await Promise.all(
          paths.map((path) => resolveSanitizerStatus(path, llmProvider)),
        );
        const nonDiscarded = statuses.filter(
          (status) => status !== "discarded",
        );
        expect(nonDiscarded).toHaveLength(0);
      });
    });
  }

  it("discards the ssrf safe fixture specifically via the private-IP/scheme guard pattern", async () => {
    const source = readFixture("js-ssrf-unvalidated-url/safe.ts");
    const paths = await buildPathsFor(
      JS_SSRF_UNVALIDATED_URL_RULE,
      "js-ssrf-unvalidated-url",
      "fixtures/js-ssrf-unvalidated-url/safe.ts",
      source,
    );

    expect(paths).toHaveLength(1);
    expect(paths[0]!.guardSourceSnippet).toContain("isAllowedUrl");
    expect(await resolveSanitizerStatus(paths[0]!, llmProvider)).toBe(
      "discarded",
    );
  });

  it("falls back to needs-verification when a guard exists but matches no known-safe pattern", async () => {
    const path: CandidatePath = {
      id: "synthetic:1:js-ssrf-unvalidated-url",
      sinkClass: "ssrf",
      steps: [
        {
          role: "source",
          label: "req.body",
          filePath: "synthetic.ts",
          line: 1,
        },
        {
          role: "sink",
          label: "fetch(url)",
          filePath: "synthetic.ts",
          line: 5,
        },
      ],
      // A guard exists (non-empty) but doesn't match any registered known-safe pattern.
      guardSourceSnippet: "function isMaybeOk(u) { return u.length > 0; }",
    };

    expect(await resolveSanitizerStatus(path, llmProvider)).toBe(
      "needs-verification",
    );
  });
});
