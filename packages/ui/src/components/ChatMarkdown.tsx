import { useState, type ReactElement } from "react";
import { CheckIcon, CopyIcon } from "./Icons.js";

interface ChatMarkdownProps {
  readonly content: string;
}

export function ChatMarkdown({ content }: ChatMarkdownProps): ReactElement {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="flex flex-col gap-2 text-xs leading-relaxed text-vscode-fg font-sans">
      {blocks.map((block, idx) => {
        if (block.type === "code") {
          return (
            <CodeBlock
              key={idx}
              language={block.language || "text"}
              code={block.content}
            />
          );
        }

        if (block.type === "header") {
          const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
          return (
            <Tag
              key={idx}
              className="font-bold text-vscode-fg tracking-wide pt-1 pb-0.5 border-b border-vscode-border/50 text-xs"
            >
              {renderInline(block.content)}
            </Tag>
          );
        }

        if (block.type === "list") {
          return (
            <ul key={idx} className="list-disc list-inside flex flex-col gap-0.5 pl-1">
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="text-vscode-fg">
                  {renderInline(item)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-line text-vscode-fg">
            {renderInline(block.content)}
          </p>
        );
      })}
    </div>
  );
}

function CodeBlock({ language, code }: { language: string; code: string }): ReactElement {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const isDiff = language === "diff";

  return (
    <div className="rounded-lg border border-vscode-border bg-vscode-bg overflow-hidden my-1 shadow-sm font-mono text-[11px]">
      {/* Code Header */}
      <div className="flex items-center justify-between px-3 py-1 bg-vscode-card border-b border-vscode-border text-[10px] text-vscode-muted uppercase tracking-wider font-sans font-bold">
        <span>{language}</span>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy Code"
          className="flex items-center gap-1 text-vscode-muted hover:text-vscode-fg transition-colors cursor-pointer px-1.5 py-0.5 rounded hover:bg-vscode-border"
        >
          {copied ? (
            <>
              <CheckIcon size={11} className="text-severity-low" />
              <span className="text-severity-low">Copied</span>
            </>
          ) : (
            <>
              <CopyIcon size={11} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code Body */}
      <div className="p-2.5 overflow-x-auto">
        <pre className="m-0 leading-tight">
          {code.split("\n").map((line, lineIdx) => {
            let lineClass = "text-vscode-fg";
            if (isDiff || line.startsWith("+") || line.startsWith("-")) {
              if (line.startsWith("+")) {
                lineClass = "text-severity-low bg-[#1E3B20]/40 -mx-2.5 px-2.5 block";
              } else if (line.startsWith("-")) {
                lineClass = "text-severity-critical bg-severity-critical-bg/40 -mx-2.5 px-2.5 block";
              }
            }
            return (
              <span key={lineIdx} className={lineClass}>
                {line || " "}
                {"\n"}
              </span>
            );
          })}
        </pre>
      </div>
    </div>
  );
}

interface MarkdownBlock {
  type: "code" | "header" | "list" | "paragraph";
  content: string;
  language?: string;
  level?: number;
  items: string[];
}

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: MarkdownBlock[] = [];

  let inCode = false;
  let codeLang = "";
  let codeLines: string[] = [];

  let listItems: string[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({
        type: "paragraph",
        content: paragraphLines.join("\n").trim(),
        items: [],
      });
      paragraphLines = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({
        type: "list",
        content: "",
        items: [...listItems],
      });
      listItems = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Code fence toggle
    if (trimmed.startsWith("```")) {
      if (!inCode) {
        flushParagraph();
        flushList();
        inCode = true;
        codeLang = trimmed.slice(3).trim();
        codeLines = [];
      } else {
        inCode = false;
        blocks.push({
          type: "code",
          content: codeLines.join("\n"),
          language: codeLang,
          items: [],
        });
        codeLines = [];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    // Headers (### Header)
    if (trimmed.startsWith("#")) {
      flushParagraph();
      flushList();
      const match = /^(#{1,6})\s+(.*)$/.exec(trimmed);
      if (match) {
        blocks.push({
          type: "header",
          level: match[1]!.length,
          content: match[2]!,
          items: [],
        });
        continue;
      }
    }

    // Unordered List (- item or * item)
    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      listItems.push(trimmed.replace(/^[-*]\s+/, ""));
      continue;
    } else {
      flushList();
    }

    // Regular line / paragraph
    if (trimmed.length === 0) {
      flushParagraph();
    } else {
      paragraphLines.push(line);
    }
  }

  flushParagraph();
  flushList();

  if (inCode && codeLines.length > 0) {
    blocks.push({
      type: "code",
      content: codeLines.join("\n"),
      language: codeLang,
      items: [],
    });
  }

  return blocks;
}

function renderInline(text: string): (string | ReactElement)[] {
  // Simple regex-based inline tokenization for bold **text** and inline `code`
  const parts: (string | ReactElement)[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIdx = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.substring(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong key={match.index} className="font-semibold text-white">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          key={match.index}
          className="rounded bg-vscode-card-hover px-1 py-0.2 font-mono text-[11px] text-severity-medium border border-vscode-border"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    lastIdx = regex.lastIndex;
  }

  if (lastIdx < text.length) {
    parts.push(text.substring(lastIdx));
  }

  return parts;
}
