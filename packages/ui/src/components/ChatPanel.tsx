import { useCallback, useRef, useState, useEffect, type ReactElement, type KeyboardEvent } from "react";
import type { ChatGraphViewMode, ChatResult, Finding } from "@whoami/types";
import { FindingCard } from "./FindingCard.js";
import { ChatMarkdown } from "./ChatMarkdown.js";
import {
  ArrowUpIcon,
  HistoryIcon,
  MenuIcon,
  MessageSquareIcon,
  TrashIcon,
  XIcon,
} from "./Icons.js";

/**
 * One question/answer exchange. The app shell owns this list (and calls
 * runChatQuery from @whoami/core to produce each `result`) — ChatPanel stays
 * presentational, matching packages/ui's "no platform-specific code, no
 * analysis logic" boundary (see CLAUDE.md's file-organization rule and
 * docs/CHAT-QUERY-ENGINE-SPEC.md §B.4).
 */
export interface ChatTurn {
  readonly id: string;
  readonly query: string;
  readonly result: ChatResult;
}

export interface ChatPanelProps {
  readonly turns: readonly ChatTurn[];
  readonly onSubmit: (query: string) => void;
  /** Selects a finding without changing which graph view is open — same
   * behavior as clicking a card in IssueTreeSidebar. */
  readonly onSelectFinding: (finding: Finding) => void;
  /** "Show Path"-style actions: selects the finding AND opens the specific
   * graph view chosen by pickGraphViewMode (see §B.8) — reuses the app
   * shell's existing openTab/setGraphViewMode handlers, just parameterized
   * by which of the 6 views fits this answer instead of always "graph". */
  readonly onOpenInGraphView: (finding: Finding, mode: ChatGraphViewMode) => void;
  /** Clears chat history turns */
  readonly onClearHistory?: () => void;
  /** Closes the chat panel */
  readonly onClose?: () => void;
}

const GRAPH_VIEW_LABEL: Record<ChatGraphViewMode, string> = {
  graph: "Data Flow DAG",
  unified: "Unified Architecture",
  blast_radius: "Blast Radius",
  control_flow: "Control Flow",
  supply_chain: "Supply Chain",
  remote: "Remote Attack Surface",
};

const CAPABILITY_LABEL: Record<ChatResult["capability"], string> = {
  SUPPORTED: "Answered",
  PARTIALLY_SUPPORTED: "Partial",
  UNSUPPORTED: "Not supported",
};

const CAPABILITY_CLASS: Record<ChatResult["capability"], string> = {
  SUPPORTED: "bg-[#1E3B20] text-[#89D185] border-[#4EC9B0]/50",
  PARTIALLY_SUPPORTED: "bg-[#382C00] text-[#CCA700] border-[#CCA700]/50",
  UNSUPPORTED: "bg-[#3A3D41] text-[#858585] border-[#3C3C3C]",
};

export function ChatPanel({
  turns,
  onSubmit,
  onSelectFinding,
  onOpenInGraphView,
  onClearHistory,
  onClose,
}: ChatPanelProps): ReactElement {
  const [inputValue, setInputValue] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        historyMenuRef.current &&
        !historyMenuRef.current.contains(event.target as Node)
      ) {
        setIsHistoryOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      onSubmit(trimmed);
      setInputValue("");
    },
    [onSubmit],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit(inputValue);
      }
    },
    [inputValue, submit],
  );

  return (
    <div className="flex h-full flex-col font-sans select-none bg-[#1E1E1E]">
      {/* 1. Wireframe Top Header: ○ Avatar + Title on Left, ≡ (History) + Close on Right */}
      <div className="flex items-center justify-between border-b border-[#303031] bg-[#181818] px-3 py-2 text-xs font-semibold shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-5 h-5 rounded-full bg-[#0E639C]/30 text-[#75BEFF] border border-[#0E639C]/60">
            <MessageSquareIcon size={11} />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#D4D4D4]">
            Chat
          </span>
          {turns.length > 0 && (
            <span className="rounded bg-[#3A3D41] px-1.5 py-0.2 text-[10px] font-mono text-[#858585]">
              {turns.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* ≡ History Button (matching wireframe sketch arrow) */}
          <div className="relative" ref={historyMenuRef}>
            <button
              type="button"
              onClick={() => setIsHistoryOpen((prev) => !prev)}
              title="Chat History"
              aria-label="Chat History"
              className={`p-1.5 rounded transition-colors cursor-pointer flex items-center justify-center ${
                isHistoryOpen
                  ? "bg-[#0E639C] text-white shadow-sm"
                  : "text-[#858585] hover:text-[#D4D4D4] hover:bg-[#2A2D2E]"
              }`}
            >
              <MenuIcon size={14} />
            </button>

            {isHistoryOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-md border border-[#3C3C3C] bg-[#252526] p-2 shadow-2xl font-sans text-xs">
                <div className="flex items-center justify-between border-b border-[#3C3C3C] pb-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-[#858585]">
                    <HistoryIcon size={12} />
                    <span>Chat History</span>
                  </div>
                  {turns.length > 0 && onClearHistory && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearHistory();
                        setIsHistoryOpen(false);
                      }}
                      title="Clear Chat History"
                      className="text-[#858585] hover:text-[#F14C4C] p-0.5 rounded transition-colors cursor-pointer"
                    >
                      <TrashIcon size={12} />
                    </button>
                  )}
                </div>

                {turns.length === 0 ? (
                  <div className="py-3 text-center text-[#666666] text-xs">
                    No conversation history yet
                  </div>
                ) : (
                  <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
                    {turns.map((t, idx) => (
                      <button
                        key={t.id || idx}
                        type="button"
                        onClick={() => {
                          setInputValue(t.query);
                          setIsHistoryOpen(false);
                          inputRef.current?.focus();
                        }}
                        className="flex items-center gap-2 p-1.5 rounded text-left text-xs text-[#CCCCCC] hover:bg-[#2A2D2E] hover:text-white transition-colors cursor-pointer truncate"
                      >
                        <MessageSquareIcon size={11} className="text-[#0E639C] shrink-0" />
                        <span className="truncate flex-1">{t.query}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close Chat"
              aria-label="Close Chat"
              className="p-1 rounded text-[#858585] hover:text-[#D4D4D4] hover:bg-[#2A2D2E] transition-colors cursor-pointer"
            >
              <XIcon size={12} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Chat Conversation Body */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-[#666666]">
            <MessageSquareIcon size={22} />
            <span className="text-xs font-medium">
              Ask about this scan's findings
            </span>
            <span className="text-[11px] text-[#555555]">
              e.g. "show critical findings", "why is F-10291 confirmed?"
            </span>
          </div>
        ) : (
          turns.map((turn) => (
            <ChatTurnView
              key={turn.id}
              turn={turn}
              onSelectFinding={onSelectFinding}
              onOpenInGraphView={onOpenInGraphView}
              onSuggestionClick={submit}
            />
          ))
        )}
      </div>

      {/* 3. Wireframe Modern Chat Prompt Box with Circular (↑) Send Button */}
      <div className="shrink-0 border-t border-[#303031] bg-[#181818] p-3">
        <div className="rounded-xl border border-[#3C3C3C] bg-[#252526] focus-within:border-[#007ACC] p-2 transition-all shadow-sm">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this scan's findings…"
            rows={2}
            className="w-full resize-none bg-transparent text-xs text-[#D4D4D4] placeholder:text-[#666666] outline-none"
          />
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-[#555555]">
              Press Enter to send, Shift+Enter for new line
            </span>
            <button
              type="button"
              onClick={() => submit(inputValue)}
              disabled={inputValue.trim().length === 0}
              title="Send Message"
              aria-label="Send Message"
              className="flex items-center justify-center w-7 h-7 rounded-full bg-[#007ACC] hover:bg-[#0098FF] disabled:opacity-30 disabled:hover:bg-[#007ACC] text-white shadow transition-all cursor-pointer"
            >
              <ArrowUpIcon size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ChatTurnViewProps {
  readonly turn: ChatTurn;
  readonly onSelectFinding: (finding: Finding) => void;
  readonly onOpenInGraphView: (finding: Finding, mode: ChatGraphViewMode) => void;
  readonly onSuggestionClick: (query: string) => void;
}

function ChatTurnView({
  turn,
  onSelectFinding,
  onOpenInGraphView,
  onSuggestionClick,
}: ChatTurnViewProps): ReactElement {
  const { result } = turn;
  const primaryFinding = result.findings[0];

  return (
    <div className="flex flex-col gap-1.5">
      {/* User's question */}
      <div className="self-end max-w-[90%] rounded-lg rounded-br-sm bg-[#094771] px-2.5 py-1.5 text-xs text-[#D4D4D4]">
        {turn.query}
      </div>

      {/* Assistant's answer */}
      <div className="max-w-[95%] rounded-lg rounded-bl-sm border border-[#303031] bg-[#252526] px-2.5 py-2 text-xs text-[#D4D4D4]">
        <span
          className={`mb-1.5 inline-flex items-center rounded border px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider ${CAPABILITY_CLASS[result.capability]}`}
        >
          {CAPABILITY_LABEL[result.capability]}
        </span>

        {result.explanation ? (
          <div className="pt-0.5">
            <ChatMarkdown content={result.explanation} />
          </div>
        ) : null}

        {result.graphViewMode && primaryFinding ? (
          <button
            type="button"
            onClick={() => onOpenInGraphView(primaryFinding, result.graphViewMode!)}
            className="mt-1.5 rounded border border-[#3C3C3C] bg-[#3A3D41] hover:bg-[#45494E] px-2 py-0.5 text-[11px] font-medium text-[#75BEFF] transition cursor-pointer"
          >
            Show in {GRAPH_VIEW_LABEL[result.graphViewMode]} →
          </button>
        ) : null}

        {result.findings.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1.5">
            {result.findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                onSelect={onSelectFinding}
              />
            ))}
          </div>
        ) : null}

        {result.suggestions && result.suggestions.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {result.suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => onSuggestionClick(suggestion)}
                className="rounded-full border border-[#3C3C3C] bg-[#2A2D2E] hover:bg-[#3A3D41] px-2 py-0.5 text-[10px] text-[#858585] hover:text-[#D4D4D4] transition cursor-pointer"
              >
                {suggestion}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
