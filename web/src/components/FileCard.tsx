import type { Comment, FileDiff, Note } from "../api/types";
import { DiffView } from "./DiffView";

interface FileCardProps {
  file: FileDiff;
  comments: Comment[];
  notes: Note[];
  diffStyle: "split" | "unified";
  isExpanded: boolean;
  isLoading?: boolean;
  isFocused: boolean;
  mode: "branch" | "working";
  onToggle: () => void;
  onToggleViewed: () => void;
  onResolveComment: (id: string) => void;
  onDismissNote: (id: string) => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  onLineClick?: (lineNumber: number, content: string) => void;
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  added: { label: "New", color: "var(--color-added)" },
  modified: { label: "Modified", color: "var(--color-modified)" },
  deleted: { label: "Deleted", color: "var(--color-deleted)" },
  renamed: { label: "Renamed", color: "var(--color-renamed)" },
  untracked: { label: "Untracked", color: "var(--color-muted)" },
};

const DEFAULT_STATUS = { label: "Modified", color: "var(--color-modified)" };

export function FileCard({
  file,
  comments,
  notes,
  diffStyle,
  isExpanded,
  isLoading,
  isFocused,
  mode,
  onToggle,
  onToggleViewed,
  onResolveComment,
  onDismissNote,
  onStage,
  onUnstage,
  onDiscard,
  onLineClick,
}: FileCardProps) {
  const status = STATUS_STYLES[file.status] ?? DEFAULT_STATUS;
  const unresolvedComments = comments.filter((c) => !c.resolved).length;
  const activeNotes = notes.filter((n) => !n.dismissed).length;
  const fileLevelComments = comments.filter(
    (c) => !c.resolved && c.line_number === undefined,
  );

  return (
    <div className={`file-card ${isFocused ? "focused" : ""} ${file.staged ? "staged" : ""}`}>
      <div className="file-header">
        <button type="button" className="file-header-main" onClick={onToggle}>
          <span className={`expand-icon ${isExpanded ? "expanded" : ""}`}>▶</span>
          <span className="file-path">{file.path}</span>
          <span className="file-status" style={{ color: status.color }}>
            {status.label}
          </span>
          <span className="file-stats">
            <span className="additions">+{file.additions}</span>
            <span className="deletions">-{file.deletions}</span>
          </span>
          {file.staged && <span className="staged-indicator">Staged</span>}
          {unresolvedComments > 0 && (
            <span className="badge comments-badge">{unresolvedComments}</span>
          )}
          {activeNotes > 0 && <span className="badge notes-badge">{activeNotes}</span>}
        </button>

        <div className="file-actions">
          {mode === "working" && file.staged && onUnstage && (
            <button type="button" className="action-btn unstage" onClick={onUnstage}>
              Unstage
            </button>
          )}
          {mode === "working" && !file.staged && onStage && (
            <button type="button" className="action-btn stage" onClick={onStage}>
              Stage
            </button>
          )}
          {mode === "working" && onDiscard && (
            <button type="button" className="action-btn discard" onClick={onDiscard}>
              Discard
            </button>
          )}
          <label className="reviewed-checkbox">
            <input type="checkbox" checked={file.viewed} onChange={onToggleViewed} />
            <span>Reviewed</span>
          </label>
        </div>
      </div>

      {isExpanded && (
        <>
          {fileLevelComments.length > 0 && (
            <div className="file-comments">
              {fileLevelComments.map((comment) => (
                <div key={comment.id} className="file-comment">
                  <div className="comment-text">{comment.text}</div>
                  <div className="comment-footer">
                    <span className="comment-time">
                      {new Date(comment.timestamp * 1000).toLocaleString()}
                    </span>
                    <button
                      type="button"
                      className="resolve-btn"
                      onClick={() => {
                        onResolveComment(comment.id);
                      }}
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="file-diff">
            {isLoading ? (
              <div className="diff-loading">Loading diff...</div>
            ) : (
              <DiffView
                file={file}
                comments={comments}
                notes={notes}
                diffStyle={diffStyle}
                onResolveComment={onResolveComment}
                onDismissNote={onDismissNote}
                onLineClick={onLineClick}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
