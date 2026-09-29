import React, { useEffect, useState } from "react";
import { CodefyLogo } from "./Icons.js";

export interface SplashScreenProps {
  /** Called once the pop-in/pop-out sequence finishes. The parent decides
   * what happens next (e.g. flipping away from a `showSplash` flag) --
   * this component only owns its own animation timing. */
  readonly onFinished?: () => void;
}

/** Simple logo pop-in, brief hold, pop-out -- no counter, no progress bar. */
const POP_OUT_DELAY_MS = 700;
const POP_OUT_DURATION_MS = 250;

export function SplashScreen({ onFinished }: SplashScreenProps): React.ReactElement {
  const [popOut, setPopOut] = useState(false);

  useEffect(() => {
    const outTimer = setTimeout(() => setPopOut(true), POP_OUT_DELAY_MS);
    const doneTimer = setTimeout(
      () => onFinished?.(),
      POP_OUT_DELAY_MS + POP_OUT_DURATION_MS,
    );
    return () => {
      clearTimeout(outTimer);
      clearTimeout(doneTimer);
    };
  }, [onFinished]);

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-vscode-header font-sans select-none overflow-hidden">
      <style>{`
        @keyframes splashPopIn {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .splash-pop-in {
          animation: splashPopIn 380ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
      `}</style>

      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(600px circle at 50% 45%, rgba(0,122,204,0.15), transparent 70%)",
        }}
      />

      <div
        className="relative splash-pop-in"
        style={{
          transition: `opacity ${POP_OUT_DURATION_MS}ms ease-in, transform ${POP_OUT_DURATION_MS}ms ease-in`,
          opacity: popOut ? 0 : 1,
          transform: popOut ? "scale(0.7)" : "scale(1)",
        }}
      >
        <CodefyLogo size={48} className="text-vscode-focus" />
      </div>
    </div>
  );
}
