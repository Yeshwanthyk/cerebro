import type { PullRequest, PRFilter } from "../../api/types";
import "./PRPicker.css";

interface PRPickerProps {
  prs: PullRequest[];
  loading: boolean;
  error: string | null;
  filter: PRFilter;
  selectedPR: number | null;
  onFilterChange: (filter: PRFilter) => void;
  onSelectPR: (pr: number) => void;
  onClearSelection: () => void;
  onRefresh: () => void;
}

const FILTER_LABELS: Record<PRFilter, string> = {
  mine: "My PRs",
  "review-requested": "Review Requested",
  all: "All Open",
};

export function PRPicker({
  prs,
  loading,
  error,
  filter,
  selectedPR,
  onFilterChange,
  onSelectPR,
  onClearSelection,
  onRefresh,
}: PRPickerProps) {
  const selectedPRData = prs.find((pr) => pr.number === selectedPR);

  // Collapsed view when PR is selected
  if (selectedPR !== null && selectedPRData) {
    return (
      <div className="pr-picker pr-picker-collapsed">
        <button
          type="button"
          className="pr-back-btn"
          onClick={onClearSelection}
        >
          ← Back to PRs
        </button>
        <div className="pr-selected-info">
          <span className="pr-number">#{selectedPRData.number}</span>
          <span className="pr-title">{selectedPRData.title}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="pr-picker">
      <div className="pr-filter-tabs">
        {(Object.keys(FILTER_LABELS) as PRFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`pr-filter-tab ${filter === f ? "active" : ""}`}
            onClick={() => onFilterChange(f)}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {error !== null && (
        <div className="pr-error">
          <span>{error}</span>
          <button type="button" onClick={onRefresh}>
            Retry
          </button>
        </div>
      )}

      {loading && <div className="pr-loading">Loading PRs...</div>}

      {!loading && error === null && prs.length === 0 && (
        <div className="pr-empty">
          No {FILTER_LABELS[filter].toLowerCase()} found
        </div>
      )}

      {!loading && error === null && prs.length > 0 && (
        <ul className="pr-list">
          {prs.map((pr) => (
            <li key={pr.number}>
              <button
                type="button"
                className={`pr-item ${selectedPR === pr.number ? "selected" : ""}`}
                onClick={() => onSelectPR(pr.number)}
              >
                <span className="pr-number">#{pr.number}</span>
                <span className="pr-title">{pr.title}</span>
                <span className="pr-meta">
                  {pr.headRefName} → {pr.baseRefName}
                </span>
                <span className="pr-stats">
                  <span className="pr-additions">+{pr.additions}</span>
                  <span className="pr-deletions">-{pr.deletions}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
