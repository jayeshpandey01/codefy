import { describe, expect, it } from "vitest";
import type { GeneratedReport } from "@whoami/types";
import { buildReportPdf } from "../components/ReportView.js";

function makeReport(markdown: string): GeneratedReport {
  return {
    sessionId: "session-1",
    generatedAt: new Date(0).toISOString(),
    markdown,
    summary: {
      total: 1,
      bySeverity: { critical: 1, high: 0, medium: 0, low: 0 },
      byStatus: { confirmed: 1, "needs-verification": 0, discarded: 0 },
    },
  };
}

const SAMPLE_MARKDOWN = `# Scan Report

- Workspace: \`/tmp/project\`
- Scan mode: local-offline

## Summary

Total findings: **1**

| Severity | Count |
| --- | --- |
| critical | 1 |
| high | 0 |

## Issues

| Severity | CWE | Title | Location | Status |
| --- | --- | --- | --- | --- |
| critical | CWE-798 | Hardcoded Secret Detected | src/config.ts:10 | confirmed |

## Details

### Hardcoded Secret Detected (critical)

CWE: CWE-798
Status: confirmed
Location: src/config.ts:10

A plaintext credential was found hardcoded in source code.

#### Suggested Fix

File: \`src/config.ts\`

\`\`\`diff
-export const API_KEY = "sk-live-example";
+export const API_KEY = process.env.API_KEY;
\`\`\`
`;

describe("buildReportPdf", () => {
  it("produces a non-trivial PDF document with real page content, not a blank page", () => {
    const doc = buildReportPdf(makeReport(SAMPLE_MARKDOWN));
    const buffer = doc.output("arraybuffer") as ArrayBuffer;
    const bytes = new Uint8Array(buffer);

    // A blank/near-empty jsPDF document is a couple KB; real drawn content
    // (headings, an autoTable, wrapped paragraph text, a diff block) should
    // push this well past that -- this is the regression guard for the
    // "blank PDF" bug (content silently failing to render).
    expect(bytes.length).toBeGreaterThan(3000);

    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    // jsPDF's default (uncompressed) stream encoding keeps drawn text
    // operators as literal strings we can find in the raw byte content.
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).toContain("Scan Report");
    expect(raw).toContain("SUMMARY");
    expect(raw).toContain("Hardcoded Secret Detected");
  });

  it("does not throw on a report with no findings", () => {
    const doc = buildReportPdf(
      makeReport("# Scan Report\n\n## Summary\n\nTotal findings: **0**\n"),
    );
    expect(doc.output("arraybuffer")).toBeInstanceOf(ArrayBuffer);
  });
});
