import React, { useMemo } from "react";
import { createPortal } from "react-dom";
import { marked } from "marked";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { GeneratedReport } from "@whoami/types";
import { DownloadIcon, FileCodeIcon, XIcon } from "./Icons.js";

export interface ReportViewProps {
  readonly isOpen: boolean;
  readonly report: GeneratedReport | null;
  readonly isLoading?: boolean;
  /** Visually emphasizes the matching download button -- e.g. when the
   * preview was opened from a "Download .md" / "Download PDF" menu entry,
   * so the user's original choice stays visible before they confirm. */
  readonly highlightFormat?: "md" | "pdf";
  readonly onClose: () => void;
  /** Host-backed file save handler (used in VS Code webview / Tauri where browser anchor download is restricted) */
  readonly onSaveFile?: (
    filename: string,
    content: string,
    encoding: "utf-8" | "base64",
    mimeType: string,
  ) => Promise<boolean | void> | void;
}

function downloadTextFile(filename: string, mimeType: string, content: string): void {
  const dataStr = `data:${mimeType};charset=utf-8,` + encodeURIComponent(content);
  const anchor = document.createElement("a");
  anchor.setAttribute("href", dataStr);
  anchor.setAttribute("download", filename);
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

const SEVERITY_MATCH = /\((critical|high|medium|low)\)\s*$/i;
type HeadingLevel = "H2" | "H3" | "H4";

/** Wraps every heading-of-`level` and its following siblings (up to the next
 * heading of the same level) into a single `<div className>` card. */
function groupIntoSections(container: HTMLElement, level: HeadingLevel, cardClass: string): void {
  const children = Array.from(container.childNodes);
  const grouped: Node[] = [];
  let currentCard: HTMLDivElement | null = null;

  for (const node of children) {
    const isHeading = node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName === level;
    if (isHeading) {
      const headingText = (node as HTMLElement).textContent ?? "";
      currentCard = document.createElement("div");
      currentCard.className = cardClass;
      if (level === "H3") {
        const severity = headingText.match(SEVERITY_MATCH)?.[1];
        if (severity) currentCard.classList.add(`severity-${severity.toLowerCase()}`);
      }
      if (level === "H4") {
        if (/suggested fix/i.test(headingText)) currentCard.classList.add("whoami-fix-section");
        else if (/taint path/i.test(headingText)) currentCard.classList.add("whoami-taint-section");
      }
      grouped.push(currentCard);
      currentCard.appendChild(node);
    } else if (currentCard) {
      currentCard.appendChild(node);
    } else {
      grouped.push(node);
    }
  }

  container.replaceChildren(...grouped);
}

/** Turns the flat Markdown->HTML output into visually distinct section/finding
 * cards -- the underlying Markdown stays flat (canonical, portable); this
 * structuring is purely a presentation concern applied to a detached DOM
 * fragment, reused for both the in-app preview and the print/PDF output. */
function structureReportHtml(rawHtml: string): string {
  const root = document.createElement("div");
  root.innerHTML = rawHtml;
  groupIntoSections(root, "H2", "whoami-report-section");
  root.querySelectorAll<HTMLElement>(".whoami-report-section").forEach((section) => {
    groupIntoSections(section, "H3", "whoami-finding-card");
  });
  root.querySelectorAll<HTMLElement>(".whoami-finding-card").forEach((card) => {
    groupIntoSections(card, "H4", "whoami-finding-subsection");
  });
  return root.innerHTML;
}

/** CSS for the structured report markup shown in the in-app preview. The
 * PDF is generated separately with jsPDF's own vector drawing APIs -- see
 * `downloadAsPdf` -- so this styling only needs to cover the on-screen view. */
function reportStyles(): string {
  const text = "#D4D4D4";
  const heading = "#FFFFFF";
  const muted = "#858585";
  const border = "#303031";
  const cardBg = "#252526";
  const nestedCardBg = "#1E1E1E";
  const codeBg = "#181818";
  const accent = "#75BEFF";
  const fixBg = "rgba(46, 160, 67, 0.08)";
  const fixBorder = "rgba(63, 185, 80, 0.35)";
  const fixHeading = "#3FB950";
  const taintBg = "rgba(56, 139, 253, 0.08)";
  const taintBorder = "rgba(56, 139, 253, 0.3)";
  const thBg = "#2A2D2E";

  return `
    .whoami-report-markdown { color: ${text}; font-size: 13px; line-height: 1.65; }
    .whoami-report-markdown h1 { font-size: 20px; font-weight: 700; color: ${heading}; margin: 0 0 12px; padding-bottom: 10px; border-bottom: 1px solid ${border}; }
    .whoami-report-markdown ul:first-of-type { list-style: none; padding-left: 0; margin: 0 0 16px; color: ${muted}; font-size: 12px; }
    .whoami-report-markdown ul:first-of-type li { margin: 2px 0; }
    .whoami-report-section { border: 1px solid ${border}; background: ${cardBg}; border-radius: 8px; padding: 14px 16px; margin: 0 0 16px; page-break-inside: avoid; }
    .whoami-report-markdown h2 { font-size: 14px; font-weight: 700; color: ${heading}; margin: 0 0 10px; text-transform: uppercase; letter-spacing: 0.04em; }
    .whoami-finding-card { border: 1px solid ${border}; border-left: 3px solid ${muted}; background: ${nestedCardBg}; border-radius: 6px; padding: 10px 14px; margin: 10px 0; page-break-inside: avoid; }
    .whoami-finding-card.severity-critical { border-left-color: #F14C4C; }
    .whoami-finding-card.severity-high { border-left-color: #E07B39; }
    .whoami-finding-card.severity-medium { border-left-color: #CCA700; }
    .whoami-finding-card.severity-low { border-left-color: #3794FF; }
    .whoami-finding-card h3 { font-size: 12.5px; font-weight: 700; color: ${heading}; margin: 0 0 6px; }
    .whoami-finding-subsection { border-radius: 6px; padding: 10px 12px; margin: 8px 0 0; }
    .whoami-finding-subsection h4 { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px; }
    .whoami-fix-section { background: ${fixBg}; border: 1px solid ${fixBorder}; }
    .whoami-fix-section h4 { color: ${fixHeading}; }
    .whoami-fix-section pre { margin-top: 0; }
    .whoami-taint-section { background: ${taintBg}; border: 1px solid ${taintBorder}; }
    .whoami-taint-section h4 { color: ${accent}; }
    .whoami-taint-section ol { margin: 0; padding-left: 18px; }
    .whoami-report-markdown p { margin: 6px 0; }
    .whoami-report-markdown strong { color: ${heading}; font-weight: 600; }
    .whoami-report-markdown table { border-collapse: collapse; width: 100%; margin: 6px 0; font-size: 12px; }
    .whoami-report-markdown th, .whoami-report-markdown td { border: 1px solid ${border}; padding: 6px 10px; text-align: left; vertical-align: top; }
    .whoami-report-markdown th { background: ${thBg}; color: ${heading}; font-weight: 600; }
    .whoami-report-markdown code { background: ${codeBg}; border: 1px solid ${border}; border-radius: 4px; padding: 1px 5px; font-family: ui-monospace, "SF Mono", Menlo, monospace; font-size: 11.5px; }
    .whoami-report-markdown pre { background: ${codeBg}; border: 1px solid ${border}; border-radius: 6px; padding: 10px 12px; overflow-x: auto; margin: 8px 0; }
    .whoami-report-markdown pre code { background: none; border: none; padding: 0; }
    .whoami-report-markdown a { color: ${accent}; }
    .whoami-report-markdown hr { border: none; border-top: 1px solid ${border}; margin: 14px 0; }
    .whoami-finding-card hr { margin: 10px 0; }
  `;
}

const PDF_PAGE_WIDTH = 595.28; // A4, pt
const PDF_PAGE_HEIGHT = 841.89;
const PDF_MARGIN = 40;
const PDF_CONTENT_RIGHT = PDF_PAGE_WIDTH - PDF_MARGIN;

type RGB = [number, number, number];
const COLOR_HEADING: RGB = [17, 17, 17];
const COLOR_BODY: RGB = [40, 40, 40];
const COLOR_MUTED: RGB = [110, 110, 110];
const COLOR_BORDER: RGB = [221, 221, 221];
const COLOR_ADDED: RGB = [26, 127, 55];
const COLOR_REMOVED: RGB = [207, 34, 46];
const COLOR_FIX: RGB = [26, 127, 55];
const COLOR_TAINT: RGB = [0, 98, 163];
const SEVERITY_COLOR: Record<string, RGB> = {
  critical: [220, 38, 38],
  high: [194, 88, 24],
  medium: [161, 98, 7],
  low: [37, 99, 235],
};

/** Strips inline Markdown emphasis markers down to plain text -- the PDF
 * renderer below draws plain vector text rather than parsing inline
 * Markdown formatting. */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1");
}

/**
 * Renders the report's canonical Markdown directly into a PDF using jsPDF's
 * own vector text/shape/table drawing APIs (jsPDF core + jspdf-autotable) --
 * no DOM rasterization. The previous approach rendered the live-styled HTML
 * via jsPDF's `.html()` (backed by html2canvas), but that requires cloning
 * and rasterizing the real DOM, which produced a blank page inside the VS
 * Code/Tauri webview sandboxes (host CSP and off-screen layout quirks both
 * interfere with html2canvas's capture). Drawing directly is slower to
 * build but has no such runtime dependency -- pure function calls into
 * jsPDF, same client-side, no native binary, no external process.
 *
 * Exported separately from the file-save side effect so it's unit-testable
 * (assert on the resulting document's content) without needing a real
 * browser download.
 */
export function buildReportPdf(report: GeneratedReport): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let y = PDF_MARGIN;

  const ensureSpace = (height: number) => {
    if (y + height > PDF_PAGE_HEIGHT - PDF_MARGIN) {
      doc.addPage();
      y = PDF_MARGIN;
    }
  };

  // Open H3 (finding card) / H4 (fix/taint subsection) sections draw a thin
  // colored accent bar in the left gutter once their extent is known --
  // closed whenever a heading at the same or a shallower level begins.
  const openBars: { level: 3 | 4; startY: number; color: RGB }[] = [];
  const closeBarsAtLevel = (level: 3 | 4) => {
    while (openBars.length > 0 && openBars[openBars.length - 1]!.level >= level) {
      const bar = openBars.pop()!;
      doc.setDrawColor(...bar.color);
      doc.setLineWidth(2.5);
      doc.line(PDF_MARGIN - 6, bar.startY - 4, PDF_MARGIN - 6, y - 6);
    }
  };
  const indentFor = () => openBars.length * 10;

  const drawText = (
    text: string,
    options: { size: number; style?: "normal" | "bold"; color?: RGB; font?: "helvetica" | "courier" },
  ) => {
    const { size, style = "normal", color = COLOR_BODY, font = "helvetica" } = options;
    const indent = indentFor();
    doc.setFont(font, style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lineHeight = size * 1.4;
    const wrapped = doc.splitTextToSize(text || " ", PDF_CONTENT_RIGHT - PDF_MARGIN - indent) as string[];
    for (const line of wrapped) {
      ensureSpace(lineHeight);
      doc.text(line, PDF_MARGIN + indent, y);
      y += lineHeight;
    }
  };

  const drawTable = (headerRow: string[] | null, bodyRows: string[][], severityCol: number | null) => {
    ensureSpace(30);
    autoTable(doc, {
      head: headerRow ? [headerRow] : undefined,
      body: bodyRows,
      startY: y,
      margin: { left: PDF_MARGIN + indentFor(), right: PDF_MARGIN },
      styles: { fontSize: 8.5, cellPadding: 5, textColor: COLOR_BODY, lineColor: COLOR_BORDER, lineWidth: 0.5 },
      headStyles: { fillColor: [42, 45, 46], textColor: 255, fontStyle: "bold" },
      alternateRowStyles: { fillColor: [250, 250, 250] },
      theme: "grid",
      didParseCell: (data) => {
        if (severityCol !== null && data.section === "body" && data.column.index === severityCol) {
          const sev = String(data.cell.raw).trim().toLowerCase();
          const color = SEVERITY_COLOR[sev];
          if (color) {
            data.cell.styles.textColor = color;
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- jspdf-autotable augments the doc instance at runtime
    y = (doc as any).lastAutoTable.finalY + 14;
  };

  let inCodeBlock = false;
  let codeLines: string[] = [];
  let tableLines: string[] = [];

  const flushTable = () => {
    if (tableLines.length === 0) return;
    const rows = tableLines
      .filter((line) => !/^\|[\s|:-]+\|$/.test(line))
      .map((line) => line.slice(1, -1).split("|").map((cell) => stripInlineMarkdown(cell.trim())));
    tableLines = [];
    if (rows.length === 0) return;
    const [header, ...body] = rows;
    const severityCol = header?.some((h) => /severity/i.test(h)) ? 0 : null;
    drawTable(header ?? null, body, severityCol);
  };

  const flushCodeBlock = () => {
    if (codeLines.length === 0) return;
    for (const rawLine of codeLines) {
      const isAdded = rawLine.startsWith("+");
      const isRemoved = rawLine.startsWith("-") && !rawLine.startsWith("---");
      drawText(rawLine || " ", {
        size: 8.5,
        font: "courier",
        color: isAdded ? COLOR_ADDED : isRemoved ? COLOR_REMOVED : COLOR_MUTED,
      });
    }
    codeLines = [];
    y += 4;
  };

  for (const rawLine of report.markdown.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");

    if (/^```/.test(line)) {
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        flushTable();
        y += 4;
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const isTableLine = /^\|.+\|$/.test(line);
    if (isTableLine) {
      tableLines.push(line);
      continue;
    }
    flushTable();

    if (!line.trim()) {
      y += 6;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      closeBarsAtLevel(3);
      ensureSpace(12);
      doc.setDrawColor(...COLOR_BORDER);
      doc.setLineWidth(0.75);
      doc.line(PDF_MARGIN + indentFor(), y, PDF_CONTENT_RIGHT, y);
      y += 12;
      continue;
    }

    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    const h4 = line.match(/^####\s+(.*)/);
    const listItem = line.match(/^(\s*)[-*]\s+(.*)/);
    const orderedItem = line.match(/^(\s*)\d+\.\s+(.*)/);

    if (h1) {
      closeBarsAtLevel(3);
      y += 4;
      drawText(stripInlineMarkdown(h1[1] ?? ""), { size: 18, style: "bold", color: COLOR_HEADING });
      ensureSpace(10);
      doc.setDrawColor(...COLOR_BORDER);
      doc.line(PDF_MARGIN, y, PDF_CONTENT_RIGHT, y);
      y += 12;
    } else if (h2) {
      closeBarsAtLevel(3);
      y += 10;
      drawText(stripInlineMarkdown(h2[1] ?? "").toUpperCase(), { size: 12, style: "bold", color: COLOR_HEADING });
      y += 2;
    } else if (h3) {
      closeBarsAtLevel(3);
      y += 8;
      const severity = (h3[1] ?? "").match(SEVERITY_MATCH)?.[1]?.toLowerCase();
      openBars.push({ level: 3, startY: y, color: (severity && SEVERITY_COLOR[severity]) || COLOR_MUTED });
      drawText(stripInlineMarkdown(h3[1] ?? ""), { size: 11, style: "bold", color: COLOR_HEADING });
    } else if (h4) {
      closeBarsAtLevel(4);
      y += 6;
      const heading = h4[1] ?? "";
      const isFix = /suggested fix/i.test(heading);
      const isTaint = /taint path/i.test(heading);
      openBars.push({ level: 4, startY: y, color: isFix ? COLOR_FIX : isTaint ? COLOR_TAINT : COLOR_MUTED });
      drawText(stripInlineMarkdown(heading).toUpperCase(), {
        size: 9,
        style: "bold",
        color: isFix ? COLOR_FIX : isTaint ? COLOR_TAINT : COLOR_MUTED,
      });
    } else if (listItem || orderedItem) {
      const match = (listItem || orderedItem)!;
      drawText(`•  ${stripInlineMarkdown(match[2] ?? "")}`, { size: 9.5 });
    } else {
      drawText(stripInlineMarkdown(line), { size: 9.5 });
    }
  }
  flushTable();
  flushCodeBlock();
  closeBarsAtLevel(3);

  return doc;
}

function downloadAsPdf(report: GeneratedReport): void {
  buildReportPdf(report).save(`whoami-report-${report.sessionId}.pdf`);
}

export function ReportView({
  isOpen,
  report,
  isLoading,
  highlightFormat,
  onClose,
  onSaveFile,
}: ReportViewProps): React.ReactElement | null {
  const structuredHtml = useMemo(() => {
    if (!report) return "";
    const rawHtml = marked.parse(report.markdown, { async: false }) as string;
    return structureReportHtml(rawHtml);
  }, [report]);

  const handleDownloadMd = async () => {
    if (!report) return;
    const filename = `whoami-report-${report.sessionId}.md`;
    if (onSaveFile) {
      await onSaveFile(filename, report.markdown, "utf-8", "text/markdown");
    } else {
      downloadTextFile(filename, "text/markdown", report.markdown);
    }
  };

  const handleDownloadPdf = async () => {
    if (!report) return;
    const filename = `whoami-report-${report.sessionId}.pdf`;
    if (onSaveFile) {
      const doc = buildReportPdf(report);
      const dataUri = doc.output("datauristring");
      const base64Pdf = dataUri.split(",")[1] || "";
      await onSaveFile(filename, base64Pdf, "base64", "application/pdf");
    } else {
      downloadAsPdf(report);
    }
  };

  if (!isOpen) return null;

  const modalElement = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan Report"
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 font-sans animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex h-[680px] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-vscode-border bg-vscode-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-vscode-border px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <FileCodeIcon size={16} className="text-vscode-focus" />
            <span className="text-sm font-semibold text-white">Scan Report</span>
            {report && (
              <span className="rounded bg-vscode-header border border-vscode-border px-1.5 py-0.5 text-[10px] font-mono text-vscode-muted">
                {report.summary.total} finding(s)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {report && (
              <>
                <button
                  type="button"
                  onClick={handleDownloadMd}
                  className={`flex items-center gap-1.5 rounded border border-vscode-focus/40 bg-vscode-focus/15 hover:bg-vscode-focus/25 px-2.5 py-1 text-xs text-severity-medium transition cursor-pointer ${
                    highlightFormat === "md" ? "ring-2 ring-severity-medium ring-offset-1 ring-offset-vscode-bg" : ""
                  }`}
                >
                  <DownloadIcon size={12} />
                  Download .md
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className={`flex items-center gap-1.5 rounded border border-vscode-border bg-vscode-card hover:bg-vscode-card-hover px-2.5 py-1 text-xs text-vscode-fg transition cursor-pointer ${
                    highlightFormat === "pdf" ? "ring-2 ring-[#3FB950] ring-offset-1 ring-offset-vscode-bg" : ""
                  }`}
                >
                  <DownloadIcon size={12} />
                  Download PDF
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-7 w-7 items-center justify-center rounded-md text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover transition-colors cursor-pointer"
            >
              <XIcon size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-vscode-header px-6 py-5">
          <style>{reportStyles()}</style>
          {isLoading || !report ? (
            <div className="flex h-full items-center justify-center text-sm text-vscode-dim">
              Generating report…
            </div>
          ) : (
            <div
              className="whoami-report-markdown"
              dangerouslySetInnerHTML={{ __html: structuredHtml }}
            />
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modalElement, document.body);
}
