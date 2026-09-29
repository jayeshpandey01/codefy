import type { ReactElement } from "react";
import type { Finding } from "@whoami/types";
import { FindingCard } from "./FindingCard.js";

export interface FindingListProps {
  readonly findings: readonly Finding[];
  readonly selectedId?: string;
  readonly onSelect?: (finding: Finding) => void;
}

export function FindingList({
  findings,
  selectedId,
  onSelect,
}: FindingListProps): ReactElement {
  if (findings.length === 0) {
    return <div className="p-4 text-xs text-vscode-muted">No findings.</div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {findings.map((finding) => (
        <FindingCard
          key={finding.id}
          finding={finding}
          isSelected={finding.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
