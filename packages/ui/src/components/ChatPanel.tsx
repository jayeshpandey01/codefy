import {
  useCallback,
  useRef,
  useState,
  useEffect,
  useMemo,
  type ReactElement,
  type KeyboardEvent,
} from "react";
import type {
  ChatGraphViewMode,
  ChatResult,
  Finding,
  SlashCommandSpec,
} from "@whoami/types";
import { SLASH_COMMANDS } from "@whoami/types";
import { FindingCard } from "./FindingCard.js";
import { ChatMarkdown } from "./ChatMarkdown.js";
import {
  ArrowUpIcon,
  ChevronDownIcon,
  HistoryIcon,
  MenuIcon,
  MessageSquareIcon,
  PlusIcon,
  TrashIcon,
  WhoAmILogo,
  XIcon,
} from "./Icons.js";

export { SLASH_COMMANDS };
export type { SlashCommandSpec as SlashCommand };

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

/**
 * A multi-turn conversation session, grouped section-wise (Today, Yesterday, etc.)
 * matching Antigravity's conversation history architecture.
 */
export interface ChatSession {
  readonly id: string;
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly turns: readonly ChatTurn[];
}

export interface ChatPanelProps {
  readonly turns: readonly ChatTurn[];
  readonly isStreaming?: boolean;
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
  /** Starts a new chat session */
  readonly onNewChat?: () => void;
  /** Selects a past session */
  readonly onSelectSession?: (session: ChatSession) => void;
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
  SUPPORTED: "bg-[#1E3B20] text-severity-low border-[#4EC9B0]/50",
  PARTIALLY_SUPPORTED: "bg-severity-high-bg text-severity-high border-severity-high/50",
  UNSUPPORTED: "bg-vscode-btn-secondary text-vscode-muted border-vscode-border",
};

const SESSIONS_STORAGE_KEY = "whoami:chat_sessions";

interface SectionGroup {
  readonly title: string;
  readonly sessions: ChatSession[];
}

function groupSessionsSectionWise(sessions: readonly ChatSession[]): SectionGroup[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const sevenDaysAgo = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const today: ChatSession[] = [];
  const yesterday: ChatSession[] = [];
  const prev7Days: ChatSession[] = [];
  const older: ChatSession[] = [];

  for (const s of sessions) {
    const time = s.updatedAt || s.createdAt;
    if (time >= startOfToday) {
      today.push(s);
    } else if (time >= startOfYesterday) {
      yesterday.push(s);
    } else if (time >= sevenDaysAgo) {
      prev7Days.push(s);
    } else {
      older.push(s);
    }
  }

  const sections: SectionGroup[] = [];
  if (today.length > 0) sections.push({ title: "Today", sessions: today });
  if (yesterday.length > 0) sections.push({ title: "Yesterday", sessions: yesterday });
  if (prev7Days.length > 0) sections.push({ title: "Previous 7 Days", sessions: prev7Days });
  if (older.length > 0) sections.push({ title: "Older", sessions: older });

  return sections;
}

function loadSavedSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: readonly ChatSession[]) {
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Ignore storage errors in test or restricted environments
  }
}

export function ChatPanel({
  turns,
  isStreaming = false,
  onSubmit,
  onSelectFinding,
  onOpenInGraphView,
  onClearHistory,
  onNewChat,
  onSelectSession,
  onClose,
}: ChatPanelProps): ReactElement {

  const [inputValue, setInputValue] = useState("");
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [slashHighlightIndex, setSlashHighlightIndex] = useState(0);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  // Active session tracking & session collection
  const [sessions, setSessions] = useState<ChatSession[]>(loadSavedSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    return turns.length > 0 ? `session-${Date.now()}` : null;
  });

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const latestQuestionRef = useRef<HTMLDivElement>(null);
  const endOfChatRef = useRef<HTMLDivElement>(null);
  const prevTurnsLengthRef = useRef(turns.length);
  const wasAtBottomRef = useRef(true);

  // Suggestions show only while composing the leading "/command" token itself
  // (no space typed yet) -- matches Claude Code's own slash-command UX.
  // Sync active turns with sessions collection
  useEffect(() => {
    if (turns.length === 0) return;

    setSessions((prevSessions) => {
      const sessionId = activeSessionId || `session-${Date.now()}`;
      if (!activeSessionId) {
        setActiveSessionId(sessionId);
      }

      const firstQuery = turns[0]?.query || "Conversation";
      const title =
        firstQuery.length > 42 ? `${firstQuery.slice(0, 42)}…` : firstQuery;

      const existingIndex = prevSessions.findIndex((s) => s.id === sessionId);
      let updated: ChatSession[];

      if (existingIndex >= 0) {
        updated = prevSessions.map((s, idx) =>
          idx === existingIndex
            ? {
                ...s,
                title: s.title || title,
                turns,
                updatedAt: Date.now(),
              }
            : s,
        );
      } else {
        const newSession: ChatSession = {
          id: sessionId,
          title,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          turns,
        };
        updated = [newSession, ...prevSessions];
      }

      saveSessions(updated);
      return updated;
    });
  }, [turns, activeSessionId]);

  // Suggestions show only while composing the leading "/command" token
  const slashMatches = useMemo<readonly SlashCommandSpec[]>(() => {
    if (!inputValue.startsWith("/") || inputValue.includes(" ")) return [];
    const typed = inputValue.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.name.startsWith(typed));
  }, [inputValue]);
  const isSlashMenuOpen = slashMatches.length > 0;

  // Once a full command name is typed (with the trailing space that starts
  // its argument section), show its argsHint as a usage caption -- a plain
  // textarea placeholder can't do this since the browser only renders
  // `placeholder` when the value is empty, and by this point the value is
  // "/vuln " (non-empty), never the hint text itself.
  const activeUsageHint = useMemo(() => {
    const trimmedEnd = inputValue.replace(/\s+$/, "");
    if (!inputValue.endsWith(" ") || !trimmedEnd.startsWith("/")) return null;
    const spec = SLASH_COMMANDS.find((c) => c.name === trimmedEnd.toLowerCase());
    return spec && spec.argsHint ? spec : null;
  }, [inputValue]);

  useEffect(() => {
    setSlashHighlightIndex(0);
  }, [slashMatches.length]);

  const acceptSlashCommand = useCallback((command: string) => {
    setInputValue(`${command} `);
    inputRef.current?.focus();
  }, []);

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

  const handleScroll = useCallback(() => {
    const el = chatContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    wasAtBottomRef.current = atBottom;
    setShowScrollBottomBtn(!atBottom);
  }, []);

  // Coordinated Scrolling:
  // When a new question is submitted:
  // 1. Scroll directly to that new question
  // 2. Then after scrolling, follow down to the end of the chat
  useEffect(() => {
    if (turns.length > prevTurnsLengthRef.current) {
      prevTurnsLengthRef.current = turns.length;

      // 1. Immediately scroll directly to the newly submitted question
      requestAnimationFrame(() => {
        if (latestQuestionRef.current) {
          latestQuestionRef.current.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      });

      // 2. Only after scrolling to the question, smoothly return/follow to the end of the chat
      const timer = setTimeout(() => {
        if (chatContainerRef.current) {
          endOfChatRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "end",
          });
        }
      }, 350);

      return () => clearTimeout(timer);
    }
    prevTurnsLengthRef.current = turns.length;
  }, [turns.length]);

  // Keep anchored to the bottom during active streaming if user was at bottom
  useEffect(() => {
    if (isStreaming && wasAtBottomRef.current) {
      endOfChatRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  }, [isStreaming, turns]);

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
      if (isSlashMenuOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSlashHighlightIndex((i) => (i + 1) % slashMatches.length);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSlashHighlightIndex(
            (i) => (i - 1 + slashMatches.length) % slashMatches.length,
          );
          return;
        }
        if (event.key === "Tab" || event.key === "Enter") {
          event.preventDefault();
          acceptSlashCommand(slashMatches[slashHighlightIndex]!.name);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setInputValue("");
          return;
        }
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submit(inputValue);
      }
    },
    [
      inputValue,
      submit,
      isSlashMenuOpen,
      slashMatches,
      slashHighlightIndex,
      acceptSlashCommand,
    ],
  );

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setIsHistoryOpen(false);
    if (onNewChat) {
      onNewChat();
    } else if (onClearHistory) {
      onClearHistory();
    }
    setInputValue("");
    inputRef.current?.focus();
  }, [onNewChat, onClearHistory]);

  const handleSelectSession = useCallback(
    (session: ChatSession) => {
      setActiveSessionId(session.id);
      setIsHistoryOpen(false);
      if (onSelectSession) {
        onSelectSession(session);
      }
    },
    [onSelectSession],
  );

  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sessionId);
        saveSessions(next);
        return next;
      });
      if (activeSessionId === sessionId) {
        handleNewChat();
      }
    },
    [activeSessionId, handleNewChat],
  );

  const handleClearAllSessions = useCallback(() => {
    setSessions([]);
    saveSessions([]);
    handleNewChat();
  }, [handleNewChat]);

  const historySections = useMemo(
    () => groupSessionsSectionWise(sessions),
    [sessions],
  );

  /**
   * Reusable Prompt Box (used in centered initial mode and bottom-docked mode)
   */
  const renderPromptBox = (isCentered: boolean) => (
    <div className={`relative w-full ${isCentered ? "max-w-md mx-auto" : ""}`}>
      {isSlashMenuOpen && (
        <div className="absolute bottom-full left-0 right-0 z-50 mb-1.5 max-h-60 overflow-y-auto rounded-md border border-vscode-border bg-vscode-card p-1 shadow-2xl font-sans text-xs">
          {slashMatches.map((cmd, idx) => (
            <button
              key={cmd.name}
              type="button"
              onClick={() => acceptSlashCommand(cmd.name)}
              onMouseEnter={() => setSlashHighlightIndex(idx)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors cursor-pointer ${
                idx === slashHighlightIndex
                  ? "bg-vscode-primary text-white"
                  : "text-vscode-fg hover:bg-vscode-card-hover"
              }`}
            >
              <span className="font-mono font-semibold shrink-0">
                {cmd.name}
                {cmd.argsHint && (
                  <span className="ml-1 font-normal opacity-60">{cmd.argsHint}</span>
                )}
              </span>
              <span
                className={`truncate text-[11px] ${
                  idx === slashHighlightIndex ? "text-white/80" : "text-vscode-muted"
                }`}
              >
                {cmd.description}
                {cmd.requiresHackerbot && " (not connected yet)"}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-vscode-border bg-vscode-card focus-within:border-vscode-focus p-2 transition-all shadow-sm">
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about this scan's findings…"
          rows={isCentered ? 3 : 2}
          className="w-full resize-none bg-transparent text-xs text-vscode-fg placeholder:text-vscode-muted outline-none"
        />
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-vscode-dim">
            {activeUsageHint ? (
              <>
                Usage:{" "}
                <span className="font-mono text-vscode-muted">
                  {activeUsageHint.name} {activeUsageHint.argsHint}
                </span>
              </>
            ) : (
              "Press Enter to send, Shift+Enter for new line"
            )}
          </span>
          <button
            type="button"
            onClick={() => submit(inputValue)}
            disabled={inputValue.trim().length === 0}
            title="Send Message"
            aria-label="Send Message"
            className="flex items-center justify-center w-7 h-7 rounded-full bg-vscode-focus hover:bg-[#0098FF] disabled:opacity-30 disabled:hover:bg-vscode-focus text-white shadow transition-all cursor-pointer"
          >
            <ArrowUpIcon size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col font-sans select-none bg-vscode-bg">
      {/* 1. Wireframe Top Header: ○ Avatar + Title on Left, ≡ (History) + Close on Right */}
      <style>{`
        @keyframes questionSlideUpFade {
          from {
            opacity: 0;
            transform: translateY(10px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-question-entry {
          animation: questionSlideUpFade 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* 1. Header: WhoAmI Logo on Top-Left, New Chat + Section-wise History + Close on Right */}
      <div className="flex items-center justify-between border-b border-vscode-border bg-vscode-header px-3 py-2 text-xs font-semibold shrink-0">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-5 h-5 rounded-full bg-vscode-primary/20 text-severity-medium border border-vscode-primary/50"
            data-testid="whoami-chat-logo"
          >
            <WhoAmILogo size={13} className="text-[#388BFD]" title="Codefy" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-vscode-fg">
            Chat
          </span>
          {turns.length > 0 && (
            <span className="rounded bg-vscode-btn-secondary px-1.5 py-0.2 text-[10px] font-mono text-vscode-muted">
              {turns.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* ≡ History Button (matching wireframe sketch arrow) */}
          {/* + New Chat Action */}
          <button
            type="button"
            onClick={handleNewChat}
            title="New Conversation"
            aria-label="New Conversation"
            className="p-1.5 rounded text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover transition-colors cursor-pointer flex items-center justify-center"
          >
            <PlusIcon size={14} />
          </button>

          {/* ≡ History Button with Antigravity-Style Section-Wise Menu */}
          <div className="relative" ref={historyMenuRef}>
            <button
              type="button"
              onClick={() => setIsHistoryOpen((prev) => !prev)}
              title="Chat History"
              aria-label="Chat History"
              className={`p-1.5 rounded transition-colors cursor-pointer flex items-center justify-center ${
                isHistoryOpen
                  ? "bg-vscode-primary text-white shadow-sm"
                  : "text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover"
              }`}
            >
              <MenuIcon size={14} />
            </button>

            {isHistoryOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-vscode-border bg-vscode-card p-2.5 shadow-2xl font-sans text-xs">
                <div className="flex items-center justify-between border-b border-vscode-border pb-2 mb-2">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-vscode-dim">
                    <HistoryIcon size={12} className="text-vscode-focus" />
                    <span>Chat History</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={handleNewChat}
                      title="Start New Conversation"
                      className="text-[10px] text-severity-medium hover:text-white hover:bg-vscode-focus/20 px-1.5 py-0.5 rounded transition cursor-pointer font-medium"
                    >
                      + New
                    </button>
                    {sessions.length > 0 && (
                      <button
                        type="button"
                        onClick={handleClearAllSessions}
                        title="Clear All History"
                        className="text-vscode-muted hover:text-severity-critical p-1 rounded transition-colors cursor-pointer"
                      >
                        <TrashIcon size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {historySections.length === 0 ? (
                  <div className="py-5 text-center text-vscode-muted text-xs">
                    <HistoryIcon size={20} className="mx-auto mb-1.5 opacity-30" />
                    No conversation history yet
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto flex flex-col gap-2.5 pr-0.5">
                    {historySections.map((section) => (
                      <div key={section.title} className="flex flex-col gap-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-vscode-dim px-1">
                          {section.title}
                        </div>
                        {section.sessions.map((sess) => {
                          const isActive = sess.id === activeSessionId;
                          return (
                            <div
                              key={sess.id}
                              className={`group flex items-center justify-between gap-2 p-1.5 rounded-md text-xs transition-colors cursor-pointer ${
                                isActive
                                  ? "bg-vscode-primary/30 text-white border border-vscode-primary/50"
                                  : "text-vscode-fg hover:bg-vscode-card-hover hover:text-vscode-fg"
                              }`}
                              onClick={() => handleSelectSession(sess)}
                            >
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <WhoAmILogo
                                  size={12}
                                  className={
                                    isActive ? "text-severity-medium" : "text-vscode-muted"
                                  }
                                />
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="truncate text-xs font-medium">
                                    {sess.title}
                                  </span>
                                  <span className="text-[9px] text-vscode-muted">
                                    {sess.turns.length}{" "}
                                    {sess.turns.length === 1 ? "question" : "questions"}
                                  </span>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteSession(sess.id);
                                }}
                                title="Delete conversation"
                                className="opacity-0 group-hover:opacity-100 p-1 text-vscode-muted hover:text-severity-critical rounded transition cursor-pointer"
                              >
                                <TrashIcon size={11} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
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
              className="p-1 rounded text-vscode-muted hover:text-vscode-fg hover:bg-vscode-card-hover transition-colors cursor-pointer"
            >
              <XIcon size={12} />
            </button>
          )}
        </div>
      </div>

      {/* 2. Chat Conversation Body & Layout Switching */}
      {turns.length === 0 ? (
        /* Initial Default State: Centered Hero Section with WhoAmI Logo & Centered Input Box */
        <div
          data-testid="chat-centered-initial"
          className="flex-1 flex flex-col items-center justify-center p-4 max-w-lg mx-auto w-full animate-in fade-in duration-200"
        >
          <div className="flex flex-col items-center text-center mb-5">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-vscode-focus/15 text-[#388BFD] border border-vscode-focus/30 mb-2.5 shadow-sm">
              <WhoAmILogo size={28} className="text-[#388BFD]" />
            </div>
            <h3 className="text-sm font-bold text-white tracking-wide mb-1">
              Ask about this scan's findings
            </h3>
            <p className="text-[11px] text-vscode-muted max-w-xs">
              e.g. "show critical findings", "why is F-10291 confirmed?", or type{" "}
              <span className="font-mono text-vscode-fg">/</span> for commands
            </p>
          </div>

          {/* Centered Input Box */}
          <div className="w-full mb-3">{renderPromptBox(true)}</div>

          {/* Quick suggestions */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-sm">
            {[
              "Show critical findings",
              "Explain high risk taint sinks",
              "What do you scan for?",
              "/help",
            ].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => submit(suggestion)}
                className="rounded-full border border-vscode-border bg-vscode-card hover:bg-vscode-card-hover hover:border-vscode-focus/50 px-2.5 py-1 text-[11px] text-vscode-dim hover:text-vscode-fg transition-all cursor-pointer shadow-xs"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Active Conversation: Vertical Conversation Turns + Docked Input Box at Bottom */
        <>
          <div
            ref={chatContainerRef}
            onScroll={handleScroll}
            data-testid="chat-conversation-container"
            className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 relative scroll-smooth"
          >
            {turns.map((turn, index) => {
              const isLatestTurn = index === turns.length - 1;
              return (
                <ChatTurnView
                  key={turn.id}
                  turn={turn}
                  isLatestTurn={isLatestTurn}
                  latestQuestionRef={latestQuestionRef}
                  onSelectFinding={onSelectFinding}
                  onOpenInGraphView={onOpenInGraphView}
                  onSuggestionClick={submit}
                />
              );
            })}

            {isStreaming && (
              <div className="flex items-center gap-2 p-2 rounded bg-vscode-card border border-vscode-border text-[11px] text-severity-medium animate-in fade-in">
                <span className="w-2 h-2 rounded-full bg-vscode-focus animate-pulse" />
                <span className="font-medium">
                  TrainIQ Vectorless RAG is analyzing codebase...
                </span>
              </div>
            )}

            {/* Anchor ref for scrolling down to the end of the chat */}
            <div ref={endOfChatRef} className="h-1 shrink-0" />

            {/* Jump to bottom button when user has scrolled up */}
            {showScrollBottomBtn && (
              <button
                type="button"
                onClick={() => {
                  endOfChatRef.current?.scrollIntoView({ behavior: "smooth" });
                  setShowScrollBottomBtn(false);
                }}
                title="Scroll to latest message"
                className="absolute bottom-3 right-4 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-vscode-primary hover:bg-vscode-primary-hover text-white shadow-lg border border-[#388BFD]/40 transition-all cursor-pointer"
              >
                <ChevronDownIcon size={14} />
              </button>
            )}
          </div>

          {/* 3. Docked Modern Chat Prompt Box at Bottom */}
          <div
            data-testid="chat-docked-bottom"
            className="relative shrink-0 border-t border-vscode-border bg-vscode-header p-3"
          >
            {renderPromptBox(false)}
          </div>
        </>
      )}
    </div>
  );
}

interface ChatTurnViewProps {
  readonly turn: ChatTurn;
  readonly isLatestTurn: boolean;
  readonly latestQuestionRef: React.RefObject<HTMLDivElement | null>;
  readonly onSelectFinding: (finding: Finding) => void;
  readonly onOpenInGraphView: (finding: Finding, mode: ChatGraphViewMode) => void;
  readonly onSuggestionClick: (query: string) => void;
}

function ChatTurnView({
  turn,
  isLatestTurn,
  latestQuestionRef,
  onSelectFinding,
  onOpenInGraphView,
  onSuggestionClick,
}: ChatTurnViewProps): ReactElement {
  const { result } = turn;
  const primaryFinding = result.findings[0];

  return (
    <div className="flex flex-col gap-1.5">
      {/* User's question with entrance animation */}
      <div
        ref={isLatestTurn ? latestQuestionRef : undefined}
        className={`self-end max-w-[90%] rounded-lg rounded-br-sm bg-vscode-card-selected px-2.5 py-1.5 text-xs text-vscode-fg shadow-sm ${
          isLatestTurn ? "animate-question-entry" : ""
        }`}
      >
        {turn.query}
      </div>

      {/* Assistant's answer */}
      <div className="max-w-[95%] rounded-lg rounded-bl-sm border border-vscode-border bg-vscode-card px-2.5 py-2 text-xs text-vscode-fg shadow-sm">
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

        {result.citations && result.citations.length > 0 ? (
          <div className="mt-2 pt-1.5 border-t border-vscode-border flex flex-col gap-1">
            <span className="text-[10px] font-semibold text-vscode-muted uppercase tracking-wider">
              Grounded Knowledge Citations (OKF & TrainIQ)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {result.citations.map((c) => (
                <span
                  key={c.citationIndex}
                  title={`Score: ${c.score ?? "N/A"}`}
                  className="inline-flex items-center gap-1 rounded bg-[#1e293b] border border-[#38bdf8]/40 px-2 py-0.5 text-[10px] font-mono text-[#38bdf8]"
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-[#0284c7]/30 text-white flex items-center justify-center text-[9px] font-bold">
                    {c.citationIndex}
                  </span>
                  <span className="truncate max-w-[220px]">{c.section}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}


        {result.graphViewMode && primaryFinding ? (
          <button
            type="button"
            onClick={() => onOpenInGraphView(primaryFinding, result.graphViewMode!)}
            className="mt-1.5 rounded border border-vscode-border bg-vscode-btn-secondary hover:bg-vscode-btn-secondary-hover px-2 py-0.5 text-[11px] font-medium text-severity-medium transition cursor-pointer"
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
                className="rounded-full border border-vscode-border bg-vscode-card-hover hover:bg-vscode-btn-secondary px-2 py-0.5 text-[10px] text-vscode-muted hover:text-vscode-fg transition cursor-pointer"
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
