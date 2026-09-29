import { useEffect, useState, type ReactElement } from "react";

export interface SplashScreenProps {
  /** Called when the splash animation completes its exit transition */
  readonly onDone: () => void;
  /** Minimum duration to show splash in ms before initiating exit fade (default: 2000) */
  readonly minDurationMs?: number;
}

const DEFAULT_MIN_DURATION_MS = 2000;
const EXIT_TRANSITION_MS = 350;

/**
 * Animated splash screen with Codefy/WhoAmI logo assembly, radial ambient glow,
 * stage-based status messages, and seamless fade-out into the main IDE workbench.
 */
export function SplashScreen({
  onDone,
  minDurationMs = DEFAULT_MIN_DURATION_MS,
}: SplashScreenProps): ReactElement {
  const [isExiting, setIsExiting] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState("Initializing AST engine…");

  useEffect(() => {
    // Stage status messages across the duration
    const t1 = setTimeout(() => {
      setStatusMessage("Loading security rules & taint graphs…");
      setProgressPercent(45);
    }, minDurationMs * 0.3);

    const t2 = setTimeout(() => {
      setStatusMessage("Preparing local workspace engine…");
      setProgressPercent(80);
    }, minDurationMs * 0.65);

    const t3 = setTimeout(() => {
      setStatusMessage("Ready");
      setProgressPercent(100);
    }, minDurationMs * 0.9);

    const tExit = setTimeout(() => {
      setIsExiting(true);
    }, minDurationMs);

    const tComplete = setTimeout(() => {
      onDone();
    }, minDurationMs + EXIT_TRANSITION_MS);

    // Allow user to press Escape or Enter to skip splash
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        setIsExiting(true);
        setTimeout(onDone, EXIT_TRANSITION_MS);
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(tExit);
      clearTimeout(tComplete);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [minDurationMs, onDone]);

  return (
    <div
      role="dialog"
      aria-label="App Launching"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#141414] select-none overflow-hidden"
      style={{
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? "scale(0.985)" : "scale(1)",
        transition: `opacity ${EXIT_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1), transform ${EXIT_TRANSITION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`,
        pointerEvents: isExiting ? "none" : "auto",
      }}
      onClick={() => {
        setIsExiting(true);
        setTimeout(onDone, EXIT_TRANSITION_MS);
      }}
    >
      <style>{`
        @keyframes splashAperturePulse {
          0%, 100% {
            transform: scale(1) rotate(0deg);
            filter: drop-shadow(0 0 24px rgba(0, 122, 204, 0.35));
          }
          50% {
            transform: scale(1.03) rotate(3deg);
            filter: drop-shadow(0 0 36px rgba(56, 189, 248, 0.6));
          }
        }

        @keyframes bladeAssemble {
          0% {
            opacity: 0;
            transform: scale(0.4) rotate(-35deg);
          }
          70% {
            opacity: 1;
            transform: scale(1.08) rotate(4deg);
          }
          100% {
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
        }

        @keyframes wordmarkFadeIn {
          0% {
            opacity: 0;
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .splash-blade-1 {
          animation: bladeAssemble 650ms cubic-bezier(0.16, 1, 0.3, 1) 0ms forwards;
        }
        .splash-blade-2 {
          animation: bladeAssemble 650ms cubic-bezier(0.16, 1, 0.3, 1) 90ms forwards;
        }
        .splash-blade-3 {
          animation: bladeAssemble 650ms cubic-bezier(0.16, 1, 0.3, 1) 180ms forwards;
        }
        .splash-blade-4 {
          animation: bladeAssemble 650ms cubic-bezier(0.16, 1, 0.3, 1) 270ms forwards;
        }
        .splash-blade-5 {
          animation: bladeAssemble 650ms cubic-bezier(0.16, 1, 0.3, 1) 360ms forwards;
        }

        .splash-logo-container {
          animation: splashAperturePulse 4s ease-in-out infinite 800ms;
        }

        .splash-wordmark {
          animation: wordmarkFadeIn 600ms cubic-bezier(0.16, 1, 0.3, 1) 450ms forwards;
        }
      `}</style>

      {/* Radiant ambient background glow */}
      <div
        className="absolute w-[460px] h-[460px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, rgba(0, 122, 204, 0.14) 0%, rgba(56, 189, 248, 0.05) 45%, rgba(20, 20, 20, 0) 70%)",
        }}
      />

      {/* Main Brand Assembly Container */}
      <div className="relative z-10 flex flex-col items-center gap-6">
        {/* Animated Vortex Logo */}
        <div className="splash-logo-container flex items-center justify-center">
          <svg
            width="88"
            height="88"
            viewBox="0 0 100 100"
            xmlns="http://www.w3.org/2000/svg"
            className="overflow-visible"
          >
            <defs>
              <linearGradient id="splashBladeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#38BDF8" />
                <stop offset="60%" stopColor="#007ACC" />
                <stop offset="100%" stopColor="#0284C7" />
              </linearGradient>
              <linearGradient id="splashCenterGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#7DD3FC" />
                <stop offset="100%" stopColor="#007ACC" />
              </linearGradient>
            </defs>

            {/* 1. Top Swirl Blade */}
            <path
              className="splash-blade-1"
              style={{ transformOrigin: "50% 50%" }}
              fill="url(#splashBladeGrad)"
              d="M 47.90 4.00 L 53.93 4.14 L 58.41 4.98 L 64.02 6.80 L 70.48 10.03 L 79.03 16.62 L 83.52 21.53 L 87.16 26.72 L 80.99 23.35 L 72.16 20.97 L 62.76 20.55 L 54.35 21.95 L 45.79 25.32 L 38.22 30.23 L 32.05 35.84 L 25.74 43.83 L 23.91 40.18 L 22.93 36.68 L 22.37 28.96 L 23.35 23.35 L 25.88 17.46 L 29.38 12.70 L 34.85 8.21 L 42.29 4.98 L 47.90 4.14 Z"
            />
            {/* 2. Left Swirl Blade */}
            <path
              className="splash-blade-2"
              style={{ transformOrigin: "50% 50%" }}
              fill="url(#splashBladeGrad)"
              d="M 23.07 18.16 L 20.27 24.05 L 18.73 31.07 L 19.15 39.06 L 21.95 46.91 L 25.88 52.38 L 31.77 57.29 L 39.20 61.08 L 48.32 64.02 L 42.15 68.65 L 34.99 71.46 L 29.80 72.16 L 24.90 71.88 L 20.55 70.76 L 16.20 68.65 L 13.12 66.41 L 9.19 62.06 L 6.80 57.71 L 5.40 53.65 L 4.70 48.88 L 4.84 43.97 L 5.82 39.06 L 7.37 34.85 L 10.45 29.38 L 13.96 25.04 L 18.73 20.83 L 23.07 18.30 Z"
            />
            {/* 3. Right Swirl Blade */}
            <path
              className="splash-blade-3"
              style={{ transformOrigin: "50% 50%" }}
              fill="url(#splashBladeGrad)"
              d="M 65.99 26.16 L 71.04 26.16 L 76.23 27.00 L 82.68 29.66 L 86.32 32.19 L 90.95 37.38 L 93.34 41.87 L 95.30 50.56 L 95.16 56.03 L 94.04 61.50 L 91.79 67.39 L 88.57 72.86 L 84.36 77.91 L 80.71 81.27 L 76.23 84.50 L 69.77 87.87 L 74.26 80.57 L 76.79 73.14 L 77.63 63.46 L 76.37 55.19 L 72.86 47.05 L 68.09 40.74 L 60.52 34.43 L 53.37 30.51 L 58.27 27.98 L 65.99 26.30 Z"
            />
            {/* 4. Center Vortex Aperture Wedge */}
            <path
              className="splash-blade-4"
              style={{ transformOrigin: "50% 50%" }}
              fill="url(#splashCenterGrad)"
              d="M 51.40 32.19 L 59.96 37.10 L 66.27 42.29 L 58.27 50.00 L 45.93 59.54 L 45.51 50.00 L 46.07 42.85 L 48.32 36.40 L 51.40 32.33 Z"
            />
            {/* 5. Bottom Swirl Blade */}
            <path
              className="splash-blade-5"
              style={{ transformOrigin: "50% 50%" }}
              fill="url(#splashBladeGrad)"
              d="M 69.91 56.59 L 71.74 60.80 L 72.86 67.25 L 72.30 75.38 L 70.48 81.13 L 67.53 86.04 L 64.02 89.83 L 59.26 93.05 L 53.23 95.30 L 49.02 96.00 L 41.87 95.72 L 35.13 93.90 L 29.24 91.09 L 23.35 86.88 L 19.29 83.10 L 14.38 77.07 L 10.45 70.62 L 17.88 74.82 L 25.46 77.07 L 33.59 77.63 L 42.99 76.37 L 50.98 73.42 L 57.29 69.63 L 65.43 62.48 L 69.91 56.73 Z"
            />
          </svg>
        </div>

        {/* Brand Titles */}
        <div className="splash-wordmark flex flex-col items-center text-center opacity-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-[0.2em] text-white font-sans uppercase">
              WhoAmI
            </h1>
            <span className="rounded-full border border-[#007ACC]/40 bg-[#007ACC]/15 px-2 py-0.5 text-[10px] font-mono font-medium text-[#75BEFF]">
              v0.1.0
            </span>
          </div>
          <p className="mt-1 text-xs font-normal tracking-wide text-[#858585]">
            Deterministic AST Taint & Security Intelligence
          </p>
        </div>

        {/* Minimal Progress Bar & Stage Hint */}
        <div className="flex flex-col items-center gap-2 mt-3 w-56">
          <div className="h-[3px] w-full bg-[#252526] rounded-full overflow-hidden border border-[#303031]">
            <div
              className="h-full bg-gradient-to-r from-[#007ACC] to-[#38BDF8] rounded-full transition-all ease-out"
              style={{
                width: `${progressPercent}%`,
                transitionDuration: "400ms",
              }}
            />
          </div>
          <div className="flex items-center justify-between w-full text-[11px] text-[#6E7681] font-mono">
            <span className="truncate">{statusMessage}</span>
            <span className="text-[#007ACC] shrink-0 font-semibold ml-2">
              {progressPercent}%
            </span>
          </div>
        </div>
      </div>

      {/* Subtle bottom skip hint */}
      <div className="absolute bottom-4 text-[10px] text-[#4A4A4F] tracking-wider uppercase font-mono">
        Click or press Esc to skip
      </div>
    </div>
  );
}

