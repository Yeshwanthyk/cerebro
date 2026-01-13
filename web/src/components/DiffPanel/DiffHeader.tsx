import type { DiffMode, FileDiff } from "../../api/types";
import { Icon } from "../Icon";

interface DiffHeaderProps {
  file: FileDiff;
  mode: DiffMode;
  viewMode: "patch" | "full";
  diffStyle: "split" | "unified";
  onToggleViewMode: () => void;
  onToggleDiffStyle: () => void;
  onToggleViewed: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
}

function StageButton({ file, onStage, onUnstage }: {
  file: FileDiff;
  onStage?: () => void;
  onUnstage?: () => void;
}) {
  if (file.staged && onUnstage) {
    return (
      <button type="button" className="diff-header-btn" onClick={onUnstage}>
        Unstage
      </button>
    );
  }
  if (!file.staged && onStage) {
    return (
      <button type="button" className="diff-header-btn stage" onClick={onStage}>
        Stage
      </button>
    );
  }
  return null;
}

export function DiffHeader({
  file,
  mode,
  viewMode,
  diffStyle,
  onToggleViewMode,
  onToggleDiffStyle,
  onToggleViewed,
  onStage,
  onUnstage,
  onDiscard,
}: DiffHeaderProps) {
  const canToggleFull = file.status === "modified" || file.status === "renamed";

  return (
    <div className="diff-header">
      <div className="diff-header-left">
        <span className="diff-file-path">{file.path}</span>
        <span className="diff-file-stats">
          <span className="additions">+{file.additions}</span>
          <span className="deletions">-{file.deletions}</span>
        </span>
      </div>
      <div className="diff-header-right">
        {/* View mode toggle */}
        {canToggleFull && (
          <button
            type="button"
            className={`diff-header-btn ${viewMode === "full" ? "active" : ""}`}
            onClick={onToggleViewMode}
            title={viewMode === "full" ? "Show patch only" : "Show full file"}
          >
            {viewMode === "full" ? "Full" : "Patch"}
          </button>
        )}

        {/* Split/unified toggle */}
        <button
          type="button"
          className={`diff-header-btn ${diffStyle === "split" ? "active" : ""}`}
          onClick={onToggleDiffStyle}
          title={diffStyle === "split" ? "Unified view" : "Split view"}
        >
          {diffStyle === "split" ? "Split" : "Unified"}
        </button>

        {/* Working mode actions */}
        {mode === "working" && (
          <>
            <StageButton file={file} onStage={onStage} onUnstage={onUnstage} />
            {onDiscard && (
              <button
                type="button"
                className="diff-header-btn discard"
                onClick={onDiscard}
                title="Discard changes"
              >
                <Icon name="trash" size={14} />
              </button>
            )}
          </>
        )}

        {/* Reviewed toggle */}
        <button
          type="button"
          className={`diff-header-btn reviewed ${file.viewed ? "active" : ""}`}
          onClick={onToggleViewed}
          title={file.viewed ? "Mark as not reviewed" : "Mark as reviewed"}
        >
          <Icon name={file.viewed ? "check-circle" : "circle"} size={14} />
          <span>Reviewed</span>
        </button>
      </div>
    </div>
  );
}
