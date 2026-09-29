import React, { useEffect, useRef } from "react";
import { THEMES, useTheme } from "./ThemeContext.js";
import type { ThemeId } from "./ThemeContext.js";

// ---------------------------------------------------------------------------
// Mini code-preview SVG rendered inside each theme card
// ---------------------------------------------------------------------------

interface CodePreviewProps {
  readonly bg: string;
  readonly sidebar: string;
  readonly accent: string;
  readonly s1: string; // syntax color 1
  readonly s2: string; // syntax color 2
  readonly s3: string; // syntax color 3
  readonly fg: string;
}

function CodePreview({ bg, sidebar, accent, s1, s2, s3, fg }: CodePreviewProps) {
  return (
    <svg
      viewBox="0 0 180 120"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
      aria-hidden="true"
    >
      {/* Editor background */}
      <rect width="180" height="120" fill={bg} rx="4" />

      {/* Left mini-sidebar panel */}
      <rect width="42" height="120" fill={sidebar} rx="0" />

      {/* Sidebar file lines */}
      <rect x="8" y="14" width="22" height="3" rx="1.5" fill={fg} opacity="0.5" />
      <rect x="8" y="21" width="16" height="3" rx="1.5" fill={fg} opacity="0.35" />
      <rect x="8" y="28" width="20" height="3" rx="1.5" fill={fg} opacity="0.35" />
      <rect x="8" y="35" width="14" height="3" rx="1.5" fill={fg} opacity="0.35" />
      <rect x="8" y="42" width="18" height="3" rx="1.5" fill={fg} opacity="0.35" />

      {/* Selected sidebar item highlight */}
      <rect x="2" y="12" width="38" height="7" rx="2" fill={accent} opacity="0.22" />

      {/* Code editor area */}
      {/* Line 1: keyword + function name */}
      <rect x="52" y="14" width="18" height="3.5" rx="1.5" fill={accent} opacity="0.9" />
      <rect x="74" y="14" width="30" height="3.5" rx="1.5" fill={s1} opacity="0.9" />

      {/* Line 2: indented — var */}
      <rect x="58" y="22" width="12" height="3.5" rx="1.5" fill={s2} opacity="0.85" />
      <rect x="74" y="22" width="50" height="3.5" rx="1.5" fill={s3} opacity="0.85" />

      {/* Line 3: indented — longer */}
      <rect x="58" y="30" width="16" height="3.5" rx="1.5" fill={s2} opacity="0.85" />
      <rect x="78" y="30" width="60" height="3.5" rx="1.5" fill={fg} opacity="0.6" />

      {/* Line 4: comment */}
      <rect x="52" y="38" width="80" height="3.5" rx="1.5" fill={fg} opacity="0.3" />

      {/* Line 5: return */}
      <rect x="58" y="46" width="20" height="3.5" rx="1.5" fill={accent} opacity="0.9" />
      <rect x="82" y="46" width="38" height="3.5" rx="1.5" fill={s1} opacity="0.8" />

      {/* Line 6: closing brace */}
      <rect x="52" y="54" width="8" height="3.5" rx="1.5" fill={fg} opacity="0.5" />

      {/* Line 7 blank gap */}
      {/* Line 8: second block */}
      <rect x="52" y="66" width="14" height="3.5" rx="1.5" fill={s2} opacity="0.9" />
      <rect x="70" y="66" width="44" height="3.5" rx="1.5" fill={s3} opacity="0.85" />

      {/* Line 9 */}
      <rect x="58" y="74" width="30" height="3.5" rx="1.5" fill={s1} opacity="0.8" />
      <rect x="92" y="74" width="20" height="3.5" rx="1.5" fill={fg} opacity="0.5" />

      {/* Bottom status bar */}
      <rect x="0" y="113" width="180" height="7" fill={accent} opacity="0.7" rx="0" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Theme Card
// ---------------------------------------------------------------------------

interface ThemeCardProps {
  readonly themeId: ThemeId;
  readonly label: string;
  readonly kind: "dark" | "light";
  readonly swatches: readonly [string, string, string, string, string, string];
  readonly selected: boolean;
  readonly onSelect: (id: ThemeId) => void;
}

function ThemeCard({ themeId, label, swatches, selected, onSelect }: ThemeCardProps) {
  const [bg, sidebar, accent, s1, s2, s3] = swatches;

  // Derive fg from kind — light themes need a dark text
  const isLight = bg > "#888888"; // rough heuristic
  const fgColor = isLight ? "#3a3a3a" : "#cccccc";

  return (
    <button
      type="button"
      onClick={() => onSelect(themeId)}
      aria-pressed={selected}
      aria-label={`Select ${label} theme`}
      className="flex flex-col items-center gap-2 cursor-pointer group focus:outline-none"
    >
      <div
        className="relative w-full rounded-lg overflow-hidden transition-all duration-150"
        style={{
          border: selected
            ? `2.5px solid ${accent}`
            : "2.5px solid transparent",
          boxShadow: selected
            ? `0 0 0 1px ${accent}40, 0 4px 16px ${accent}22`
            : "0 2px 8px rgba(0,0,0,0.25)",
          outline: "none",
        }}
      >
        {/* Ring on hover when not selected */}
        <div
          className="absolute inset-0 rounded-lg pointer-events-none transition-opacity duration-150 opacity-0 group-hover:opacity-100"
          style={{
            boxShadow: selected ? "none" : "inset 0 0 0 2px rgba(255,255,255,0.15)",
          }}
        />
        <div className="aspect-[3/2]">
          <CodePreview
            bg={bg}
            sidebar={sidebar}
            accent={accent}
            s1={s1}
            s2={s2}
            s3={s3}
            fg={fgColor}
          />
        </div>
        {selected && (
          <div
            className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
            style={{ background: accent }}
          >
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
              <path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
      </div>
      <span
        className="text-xs font-medium text-center leading-tight"
        style={{
          color: selected ? accent : "#858585",
        }}
      >
        {label}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main ThemePicker
// ---------------------------------------------------------------------------

export interface ThemePickerProps {
  /** Called when theme changes (to persist in settings) */
  readonly onThemeChange?: (themeId: ThemeId) => void;
  /** If true, shows the keyboard hint at the top */
  readonly showHint?: boolean;
  /** Optional additional className for the grid container */
  readonly className?: string;
}

export function ThemePicker({
  onThemeChange,
  showHint = false,
  className = "",
}: ThemePickerProps): React.ReactElement {
  const { theme, setTheme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = (id: ThemeId) => {
    setTheme(id);
    onThemeChange?.(id);
  };

  // Arrow-key navigation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const idx = THEMES.findIndex((t) => t.id === theme);
      if (idx === -1) return;
      const next =
        e.key === "ArrowLeft"
          ? Math.max(0, idx - 1)
          : Math.min(THEMES.length - 1, idx + 1);
      const nextTheme = THEMES[next];
      if (nextTheme) handleSelect(nextTheme.id);
    };
    el.addEventListener("keydown", handleKey);
    return () => el.removeEventListener("keydown", handleKey);
  }, [theme]);

  return (
    <div ref={containerRef} className={`flex flex-col gap-4 ${className}`} tabIndex={0}>
      {showHint && (
        <p className="text-xs text-center" style={{ color: "#858585" }}>
          Click or use arrow keys (← or →) to select, Enter to confirm.
        </p>
      )}

      {/* Dark themes section */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#5a5a5a" }}>
          Dark Themes
        </p>
        <div className={`grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5`}>
          {THEMES.filter((t) => t.kind === "dark").map((t) => (
            <ThemeCard
              key={t.id}
              themeId={t.id}
              label={t.label}
              kind={t.kind}
              swatches={t.swatches}
              selected={theme === t.id}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>

      {/* Light themes section */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "#5a5a5a" }}>
          Light Themes
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {THEMES.filter((t) => t.kind === "light").map((t) => (
            <ThemeCard
              key={t.id}
              themeId={t.id}
              label={t.label}
              kind={t.kind}
              swatches={t.swatches}
              selected={theme === t.id}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
