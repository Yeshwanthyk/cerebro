import type { Commit } from "../../api/types";
import "./CommitPicker.css";

interface CommitPickerProps {
  commits: Commit[];
  loading: boolean;
  error: string | null;
  selectedCommit: string | null;
  onSelectCommit: (sha: string) => void;
  onClearSelection: () => void;
  onRefresh: () => void;
  onOpenInBrowser?: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

export function CommitPicker({
  commits,
  loading,
  error,
  selectedCommit,
  onSelectCommit,
  onClearSelection,
  onRefresh,
  onOpenInBrowser,
}: CommitPickerProps) {
  const selectedCommitData = commits.find((c) => c.sha === selectedCommit);

  // Collapsed view when commit is selected
  if (selectedCommit !== null && selectedCommitData) {
    return (
      <div className="commit-picker commit-picker-collapsed">
        <button
          type="button"
          className="commit-back-btn"
          onClick={onClearSelection}
        >
          Back to Commits
        </button>
        <div className="commit-selected-info">
          <span className="commit-sha">{selectedCommitData.shortSha}</span>
          <span className="commit-message">{selectedCommitData.message}</span>
          <span className="commit-author">by {selectedCommitData.author}</span>
        </div>
        {onOpenInBrowser && (
          <button
            type="button"
            className="commit-open-btn"
            onClick={onOpenInBrowser}
            title="Open in GitHub"
          >
            Open in GitHub
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="commit-picker">
      <div className="commit-header">
        <h3>Recent Commits</h3>
        <button type="button" className="commit-refresh-btn" onClick={onRefresh}>
          Refresh
        </button>
      </div>

      {error !== null && (
        <div className="commit-error">
          <span>{error}</span>
          <button type="button" onClick={onRefresh}>
            Retry
          </button>
        </div>
      )}

      {loading && <div className="commit-loading">Loading commits...</div>}

      {!loading && error === null && commits.length === 0 && (
        <div className="commit-empty">No commits found</div>
      )}

      {!loading && error === null && commits.length > 0 && (
        <ul className="commit-list">
          {commits.map((commit) => (
            <li key={commit.sha}>
              <button
                type="button"
                className={`commit-item ${selectedCommit === commit.sha ? "selected" : ""}`}
                onClick={() => onSelectCommit(commit.sha)}
              >
                <span className="commit-sha">{commit.shortSha}</span>
                <span className="commit-message">{commit.message}</span>
                <span className="commit-meta">
                  <span className="commit-author">{commit.author}</span>
                  <span className="commit-date">{formatDate(commit.date)}</span>
                </span>
                <span className="commit-stats">
                  <span className="commit-additions">+{commit.additions}</span>
                  <span className="commit-deletions">-{commit.deletions}</span>
                  <span className="commit-files">{commit.filesChanged} files</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
