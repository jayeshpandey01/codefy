import { useEffect, useState, type ReactElement } from "react";
import type { UpdateNotice } from "@whoami/types";
import { useBridge } from "../bridge/BridgeContext.js";
import { ChatMarkdown } from "./ChatMarkdown.js";
import { CheckCircleIcon, DownloadIcon, RefreshCwIcon, SparklesIcon, XIcon } from "./Icons.js";

/**
 * Renders every UpdateNotice kind from one component -- no host-specific
 * branching, per the contract-first rule (packages/ui never knows whether
 * it's hosted in the VS Code webview or the Tauri window). See
 * docs/RELEASE-PIPELINE.md:
 *
 *  - Desktop host drives "available" -> "progress" -> "ready" (or "error")
 *    around an update:install/update:restart round trip with the user.
 *  - Both hosts emit "updated" once, right after a version bump they detect
 *    on their own side.
 *
 * Mount once near the top of the app shell; renders nothing (null) once
 * dismissed or with no notice pending.
 */
export function UpdateBanner(): ReactElement | null {
  const bridge = useBridge();
  const [notice, setNotice] = useState<UpdateNotice | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return bridge.on("update-notice", (message) => {
      setNotice(message.notice);
      setDismissed(false);
      setShowNotes(false);
    });
  }, [bridge]);

  useEffect(() => {
    if (notice?.kind !== "updated") return;
    const timer = setTimeout(() => setDismissed(true), 10_000);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice || dismissed) return null;

  const notes = notice.kind === "available" || notice.kind === "updated" ? notice.notes : undefined;
  const version = notice.kind === "available" || notice.kind === "ready" ? notice.version : undefined;

  return (
    <div
      role="status"
      className="rounded-md border border-vscode-border bg-vscode-card px-3 py-2 text-xs text-vscode-fg shadow-md"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <UpdateBannerIcon notice={notice} />
          <span className="truncate">
            <UpdateBannerLabel notice={notice} />
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {notes && (
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="rounded border border-vscode-border bg-vscode-bg px-2 py-1 text-[11px] text-vscode-fg hover:bg-vscode-card-hover transition-colors cursor-pointer"
            >
              What&apos;s new
            </button>
          )}
          {notice.kind === "available" && (
            <button
              type="button"
              onClick={() => bridge.send({ type: "update-install-request" })}
              className="flex items-center gap-1 rounded bg-[#0E639C] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#1177BB] transition-colors cursor-pointer"
            >
              <DownloadIcon size={11} />
              <span>Update now</span>
            </button>
          )}
          {notice.kind === "ready" && (
            <button
              type="button"
              onClick={() => bridge.send({ type: "update-restart-request" })}
              className="flex items-center gap-1 rounded bg-[#0E639C] px-2 py-1 text-[11px] font-medium text-white hover:bg-[#1177BB] transition-colors cursor-pointer"
            >
              <RefreshCwIcon size={11} />
              <span>Restart to update</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (version) bridge.send({ type: "update-dismiss-request", version });
              setDismissed(true);
            }}
            title="Dismiss"
            className="rounded p-1 text-vscode-muted hover:bg-vscode-card-hover transition-colors cursor-pointer"
          >
            <XIcon size={12} />
          </button>
        </div>
      </div>

      {notice.kind === "progress" && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-vscode-bg">
          <div
            className="h-full bg-[#0E639C] transition-all"
            style={{
              width: notice.total
                ? `${Math.min(100, Math.round((notice.downloaded / notice.total) * 100))}%`
                : "40%",
            }}
          />
        </div>
      )}

      {showNotes && notes && (
        <div className="mt-2 border-t border-vscode-border pt-2">
          <ChatMarkdown content={notes} />
        </div>
      )}
    </div>
  );
}

function UpdateBannerIcon({ notice }: { readonly notice: UpdateNotice }): ReactElement {
  switch (notice.kind) {
    case "available":
      return <DownloadIcon size={14} className="shrink-0 text-[#4FC1FF]" />;
    case "progress":
      return <RefreshCwIcon size={14} className="shrink-0 animate-spin text-[#4FC1FF]" />;
    case "ready":
      return <SparklesIcon size={14} className="shrink-0 text-[#4FC1FF]" />;
    case "updated":
      return <CheckCircleIcon size={14} className="shrink-0 text-[#89D185]" />;
    case "error":
      return <XIcon size={14} className="shrink-0 text-[#F87171]" />;
  }
}

function UpdateBannerLabel({ notice }: { readonly notice: UpdateNotice }): string {
  switch (notice.kind) {
    case "available":
      return `WhoAmI ${notice.version} is available`;
    case "progress":
      return notice.total
        ? `Downloading update... ${Math.round((notice.downloaded / notice.total) * 100)}%`
        : "Downloading update...";
    case "ready":
      return `WhoAmI ${notice.version} is ready to install`;
    case "updated":
      return `Updated to ${notice.to}`;
    case "error":
      return `Update failed: ${notice.message}`;
  }
}
