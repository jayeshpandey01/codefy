import { useCallback, useState, type ReactElement } from "react";
import type {
  BridgeMessage,
  Finding,
  FindingStatus,
  Severity,
} from "@whoami/types";
import { SeverityBadge } from "./SeverityBadge.js";
import { useBridge } from "../bridge/BridgeContext.js";
import {
  CheckIcon,
  ExternalLinkIcon,
  PlayIcon,
  RefreshCwIcon,
  WandIcon,
} from "./Icons.js";
import { DiffPreviewModal } from "./DiffPreviewModal.js";
import { PocModal } from "./PocModal.js";

const STATUS_LABEL: Record<FindingStatus, string> = {
  confirmed: "Confirmed",
  "needs-verification": "Needs Verification",
  discarded: "Discarded",
};

const STATUS_CLASS: Record<FindingStatus, string> = {
  confirmed: "bg-[#5A1D1D] text-[#F14C4C] border-[#BE1100]",
  "needs-verification": "bg-[#382C00] text-[#CCA700] border-[#CCA700]/50",
  discarded: "bg-[#3A3D41] text-[#858585] border-[#3C3C3C]",
};

const SEVERITY_STRIPE: Record<Severity, string> = {
  critical: "bg-[#F14C4C]",
  high: "bg-[#CCA700]",
  medium: "bg-[#75BEFF]",
  low: "bg-[#89D185]",
};

type PocState = "idle" | "running" | "verified" | "unverified" | "error";

export interface FindingCardProps {
  readonly finding: Finding;
  readonly isSelected?: boolean;
  readonly onSelect?: (finding: Finding) => void;
}

export function FindingCard({
  finding,
  isSelected = false,
  onSelect,
}: FindingCardProps): ReactElement {
  const bridge = useBridge();
  const [pocState, setPocState] = useState<PocState>("idle");
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
  const [isPocModalOpen, setIsPocModalOpen] = useState(false);

  const steps = finding.trace.steps;
  const entryStep = steps[0];
  const sinkStep = steps[steps.length - 1];
  const jumpTarget = sinkStep ?? entryStep;

  const handleSelect = useCallback(() => {
    onSelect?.(finding);
  }, [onSelect, finding]);

  const handleJumpToLine = useCallback(() => {
    if (!jumpTarget) return;
    const message: BridgeMessage = {
      type: "jump-to-line",
      filePath: jumpTarget.filePath,
      line: jumpTarget.line,
    };
    bridge.send(message);
  }, [bridge, jumpTarget]);

  const handleApplyFix = useCallback(() => {
    const message: BridgeMessage = {
      type: "apply-fix-request",
      findingId: finding.id,
    };
    bridge.send(message);
  }, [bridge, finding.id]);

  const handleRunPoc = useCallback(() => {
    setPocState("running");
    bridge
      .request<
        Extract<BridgeMessage, { type: "run-poc-request" }>,
        Extract<BridgeMessage, { type: "run-poc-result" }>
      >({ type: "run-poc-request", findingId: finding.id })
      .then((result) => {
        setPocState(result.verified ? "verified" : "unverified");
      })
      .catch(() => {
        setPocState("error");
      });
  }, [bridge, finding.id]);

  return (
    <div
      role="article"
      onClick={handleSelect}
      className={`relative flex cursor-pointer overflow-hidden rounded border transition-all ${
        isSelected
          ? "border-[#007ACC] bg-[#094771] shadow-md ring-1 ring-[#007ACC]"
          : "border-[#303031] bg-[#252526] hover:bg-[#2A2D2E]"
      }`}
    >
      <div
        className={`w-1 shrink-0 ${SEVERITY_STRIPE[finding.severity]}`}
        aria-hidden="true"
      />
      <div className="flex flex-1 flex-col gap-1.5 p-3 font-sans select-none">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SeverityBadge severity={finding.severity} />
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.2 text-[10px] font-medium tracking-wide ${STATUS_CLASS[finding.status]}`}
            >
              {STATUS_LABEL[finding.status]}
            </span>
            <span className="rounded border border-[#007ACC]/40 bg-[#04395E]/40 px-1 py-0.2 text-[9px] font-mono text-[#75BEFF]">
              [{finding.scope || "security"}:{finding.code || finding.ruleId}]
            </span>
          </div>
          {finding.cwe ? (
            <span className="font-mono text-xs text-[#858585]">
              {finding.cwe}
            </span>
          ) : null}
        </div>

        <h3 className="text-xs font-semibold text-[#D4D4D4] leading-snug">
          {finding.title}
        </h3>

        {jumpTarget ? (
          <p className="font-mono text-[11px] text-[#858585]">
            {jumpTarget.filePath}:{jumpTarget.line}
          </p>
        ) : null}

        <p className="text-xs text-[#858585] line-clamp-2 leading-relaxed">
          {finding.description}
        </p>

        <div className="mt-1.5 flex gap-1.5">
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsDiffModalOpen(true);
            }}
            className="flex items-center gap-1 rounded border border-[#3C3C3C] bg-[#3A3D41] hover:bg-[#45494E] px-2 py-0.5 text-[11px] font-medium text-[#D4D4D4] transition cursor-pointer"
          >
            <WandIcon size={12} className="text-[#75BEFF]" />
            <span>Apply Fix</span>
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setIsPocModalOpen(true);
            }}
            disabled={pocState === "running"}
            className="flex items-center gap-1 rounded border border-[#3C3C3C] bg-[#3A3D41] hover:bg-[#45494E] px-2 py-0.5 text-[11px] font-medium text-[#D4D4D4] disabled:opacity-50 transition cursor-pointer"
          >
            {pocState === "running" ? (
              <>
                <RefreshCwIcon
                  size={11}
                  className="animate-spin text-[#75BEFF]"
                />
                <span>Running…</span>
              </>
            ) : pocState === "verified" ? (
              <>
                <CheckIcon size={10} className="text-[#89D185]" />
                <span className="text-[#89D185] font-medium">PoC Verified</span>
              </>
            ) : (
              <>
                <PlayIcon size={10} className="text-[#89D185]" />
                <span>Run Local PoC</span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              handleJumpToLine();
            }}
            className="flex items-center gap-1 rounded border border-[#3C3C3C] bg-[#3A3D41] hover:bg-[#45494E] px-2 py-0.5 text-[11px] font-medium text-[#D4D4D4] transition"
          >
            <ExternalLinkIcon size={11} className="text-[#75BEFF]" />
            <span>Jump to Line</span>
          </button>
        </div>
      </div>

      {/* Diff Preview Confirmation Modal */}
      {isDiffModalOpen && (
        <DiffPreviewModal
          finding={finding}
          isOpen={isDiffModalOpen}
          onClose={() => setIsDiffModalOpen(false)}
          onApplyFix={handleApplyFix}
        />
      )}

      {/* PoC Runtime Verification Modal */}
      {isPocModalOpen && (
        <PocModal
          finding={finding}
          isOpen={isPocModalOpen}
          onClose={() => setIsPocModalOpen(false)}
          onRunPoc={async () => {
            const res = await bridge.request<
              Extract<BridgeMessage, { type: "run-poc-request" }>,
              Extract<BridgeMessage, { type: "run-poc-result" }>
            >({ type: "run-poc-request", findingId: finding.id });
            setPocState(res.verified ? "verified" : "unverified");
            return res;
          }}
        />
      )}
    </div>
  );
}
