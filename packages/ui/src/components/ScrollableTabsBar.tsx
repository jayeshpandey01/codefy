import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  type ReactElement,
} from "react";
import { XIcon } from "./Icons.js";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface ScrollableTabsBarProps {
  tabs: TabItem[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string, e: React.MouseEvent) => void;
  className?: string;
}

/**
 * Authentic VS Code Editor Tabs Bar with:
 * 1. Custom DOM overlay scrollbar slider (matching VS Code's monaco-scrollable-element).
 * 2. Dynamic left/right overflow shadows.
 * 3. Mouse wheel horizontal scroll navigation.
 * 4. Draggable 3px horizontal slider at bottom: 0.
 * 5. Middle-click to close tabs.
 * 6. Auto-scroll active tab into view.
 */
export function ScrollableTabsBar({
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  className = "",
}: ScrollableTabsBarProps): ReactElement {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const [showLeftShadow, setShowLeftShadow] = useState(false);
  const [showRightShadow, setShowRightShadow] = useState(false);
  const [canScroll, setCanScroll] = useState(false);
  const [thumbMetrics, setThumbMetrics] = useState({ leftPct: 0, widthPct: 20 });
  const [isHovered, setIsHovered] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  const updateScrollState = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 2;
    setCanScroll(overflow);

    setShowLeftShadow(scrollLeft > 2);
    setShowRightShadow(scrollLeft < scrollWidth - clientWidth - 2);

    if (overflow) {
      const minThumbPct = 6;
      const widthPct = Math.max((clientWidth / scrollWidth) * 100, minThumbPct);
      const maxScroll = scrollWidth - clientWidth;
      const leftPct = maxScroll > 0 ? (scrollLeft / maxScroll) * (100 - widthPct) : 0;
      setThumbMetrics({ leftPct, widthPct });
    }
  }, []);

  useEffect(() => {
    updateScrollState();
    const el = containerRef.current;
    if (!el) return;

    const handleResize = () => updateScrollState();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [tabs, updateScrollState]);

  // Clean up RAF and scroll timeout on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Smoothly scroll active tab into view horizontally without moving parent containers
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const activeEl = el.querySelector<HTMLElement>(`[data-tab-id="${activeTab}"]`);
    if (!activeEl) return;

    const elLeft = activeEl.offsetLeft;
    const elWidth = activeEl.offsetWidth;
    const scrollLeft = el.scrollLeft;
    const clientWidth = el.clientWidth;

    if (elLeft < scrollLeft) {
      el.scrollTo({ left: elLeft, behavior: "smooth" });
    } else if (elLeft + elWidth > scrollLeft + clientWidth) {
      el.scrollTo({ left: elLeft + elWidth - clientWidth, behavior: "smooth" });
    }
  }, [activeTab]);

  // Native non-passive wheel listener for smooth horizontal scroll translation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      // If predominantly vertical scrolling (e.g. mouse wheel), translate to horizontal scroll
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        if (e.deltaY !== 0) {
          if (e.cancelable) {
            e.preventDefault();
          }
          el.scrollLeft += e.deltaY;
        }
      }
      // If predominantly horizontal (trackpad swipe), native scroll handles it smoothly
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
    };
  }, []);

  const handleScroll = () => {
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        updateScrollState();
        rafRef.current = null;
      });
    }
    setIsScrolling(true);
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 1200);
  };

  const handleAuxClick = (tabId: string, e: React.MouseEvent) => {
    // Button 1 is middle-click in standard DOM
    if (e.button === 1) {
      e.preventDefault();
      onCloseTab(tabId, e);
    }
  };

  // Slider Dragging Logic matching Monaco HorizontalScrollbar
  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);

    const startX = e.clientX;
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const startScrollLeft = el.scrollLeft;
    const trackWidth = track.clientWidth;
    const thumbWidthPx = (thumbMetrics.widthPct / 100) * trackWidth;
    const availableTrack = trackWidth - thumbWidthPx;
    const maxScroll = el.scrollWidth - el.clientWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      if (availableTrack > 0) {
        const scrollDelta = (deltaX / availableTrack) * maxScroll;
        el.scrollLeft = startScrollLeft + scrollDelta;
      }
    };

    const onMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  // Track click to jump scroll
  const handleTrackClick = (e: React.MouseEvent) => {
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    const rect = track.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const trackWidth = rect.width;
    const ratio = clickX / trackWidth;
    const maxScroll = el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: ratio * maxScroll, behavior: "smooth" });
  };

  const isSliderVisible = canScroll && (isHovered || isScrolling || isDragging);

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative flex items-center justify-between border-b border-vscode-border bg-vscode-header px-2 pt-1 shrink-0 z-10 ${className}`}
    >
      {/* Left overflow shadow matching VS Code */}
      {showLeftShadow && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-vscode-header via-vscode-header/70 to-transparent z-20 transition-opacity duration-200"
        />
      )}

      {/* Tabs scrollable container (native scrollbars hidden, smooth scroll without animation lockups) */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5 w-full select-none"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              onClick={() => onSelectTab(tab.id)}
              onAuxClick={(e) => handleAuxClick(tab.id, e)}
              title={`${tab.label} (middle click to close)`}
              className={`group flex items-center gap-2 px-3 py-1.5 text-xs font-medium uppercase tracking-wider rounded-t transition-colors cursor-pointer border-t-2 select-none shrink-0 ${
                isActive
                  ? "bg-vscode-bg text-vscode-fg border-vscode-focus border-x border-vscode-border shadow-sm font-semibold"
                  : "bg-vscode-card/50 text-vscode-muted border-transparent hover:text-vscode-fg hover:bg-vscode-card"
              }`}
            >
              {tab.icon}
              <span className="truncate">{tab.label}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id, e);
                }}
                title={`Close ${tab.label}`}
                className="rounded p-0.5 text-vscode-muted hover:text-vscode-fg hover:bg-vscode-btn-secondary transition-colors cursor-pointer ml-0.5"
              >
                <XIcon size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Right overflow shadow matching VS Code */}
      {showRightShadow && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-vscode-header via-vscode-header/70 to-transparent z-20 transition-opacity duration-200"
        />
      )}

      {/* VS Code Custom DOM Overlay Scrollbar (3px) at bottom: 0 */}
      {canScroll && (
        <div
          ref={trackRef}
          role="scrollbar"
          aria-orientation="horizontal"
          onClick={handleTrackClick}
          className={`absolute bottom-0 left-0 right-0 h-[3px] z-30 transition-opacity duration-150 cursor-pointer ${
            isSliderVisible ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          <div
            role="slider"
            aria-valuenow={thumbMetrics.leftPct}
            onMouseDown={handleThumbMouseDown}
            style={{
              left: `${thumbMetrics.leftPct}%`,
              width: `${thumbMetrics.widthPct}%`,
            }}
            className={`absolute top-0 bottom-0 rounded-[2px] transition-colors duration-150 ${
              isDragging
                ? "bg-vscode-primary"
                : "bg-vscode-muted/45 hover:bg-vscode-muted/80 active:bg-vscode-primary"
            }`}
          />
        </div>
      )}
    </div>
  );
}
