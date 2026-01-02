import { useState, useEffect } from "react";
import { Icon } from "../Icon";
import { PRActions } from "../PRActions";
import { RepoPicker } from "../RepoPicker";
import type { Repository, DiffResponse } from "../../api/types";
import "./Header.css";

type DiffMode = "branch" | "working" | "pr";

interface HeaderProps {
  repos: Repository[];
  currentRepo: string | null;
  diff: DiffResponse | null;
  mode: DiffMode;
  diffStyle: "split" | "unified";
  branches: string[];
  compareBranch: string | null;
  hasStaged: boolean;
  onRepoSelect: (id: string) => void;
  onAddRepo: (path: string) => Promise<void>;
  onRemoveRepo: (id: string) => void;
  onModeChange: (mode: DiffMode) => void;
  onDiffStyleChange: (style: "split" | "unified") => void;
  onCompareBranchChange: (branch: string) => void;
  onCommitClick: () => void;
  onRefresh: () => void;
  onPRReviewSuccess?: (message: string) => void;
  onPRReviewError?: (error: string) => void;
}

export function Header({
  repos,
  currentRepo,
  diff,
  mode,
  diffStyle,
  branches,
  compareBranch,
  hasStaged,
  onRepoSelect,
  onAddRepo,
  onRemoveRepo,
  onModeChange,
  onDiffStyleChange,
  onCompareBranchChange,
  onCommitClick,
  onRefresh,
  onPRReviewSuccess,
  onPRReviewError,
}: HeaderProps) {
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const currentRepoData = repos.find((r) => r.id === currentRepo);

  // Close branch picker on click outside
  useEffect(() => {
    if (!showBranchPicker) return;
    const handleClickOutside = () => setShowBranchPicker(false);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showBranchPicker]);

  return (
    <header className="header">
      <div className="header-left">
        <img src="/images/Cerebro.png" alt="Cerebro" className="header-logo" />
        <RepoPicker
          repos={repos}
          currentRepo={currentRepo}
          onSelect={onRepoSelect}
          onAdd={onAddRepo}
          onRemove={onRemoveRepo}
        />
        <div className="header-separator" />
        <div className="mode-switcher">
          <button
            type="button"
            className={mode === "branch" ? "active" : ""}
            onClick={() => onModeChange("branch")}
          >
            Branch
          </button>
          <button
            type="button"
            className={mode === "working" ? "active" : ""}
            onClick={() => onModeChange("working")}
          >
            Working
          </button>
          <button
            type="button"
            className={mode === "pr" ? "active" : ""}
            onClick={() => onModeChange("pr")}
          >
            PRs
          </button>
        </div>
        <span className="branch">{diff?.branch}</span>
        {mode === "branch" && (
          <div className="branch-selector">
            <span className="compare-label">vs</span>
            <button
              type="button"
              className="branch-selector-btn"
              onClick={(e) => {
                e.stopPropagation();
                setShowBranchPicker(!showBranchPicker);
              }}
              aria-expanded={showBranchPicker}
              aria-haspopup="listbox"
            >
              {compareBranch ?? currentRepoData?.baseBranch ?? "main"}
              <span className="dropdown-arrow" aria-hidden="true">
                ▼
              </span>
            </button>
            {showBranchPicker && (
              <div className="branch-picker" role="listbox" aria-label="Select branch">
                {branches.map((b) => (
                  <button
                    key={b}
                    type="button"
                    role="option"
                    aria-selected={b === (compareBranch ?? currentRepoData?.baseBranch)}
                    className={b === (compareBranch ?? currentRepoData?.baseBranch) ? "active" : ""}
                    onClick={() => {
                      onCompareBranchChange(b);
                      setShowBranchPicker(false);
                    }}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {mode === "working" && <span className="commit">{diff?.commit.slice(0, 7)}</span>}
        {mode === "pr" && diff?.pr_number !== undefined && (
          <span className="pr-info">
            <span className="pr-badge">#{diff.pr_number}</span>
            <span className="pr-title-header">{diff.pr_title}</span>
          </span>
        )}
      </div>
      <div className="header-right">
        {mode === "pr" && diff?.pr_number !== undefined && currentRepo !== null && (
          <PRActions
            prNumber={diff.pr_number}
            repoId={currentRepo}
            onSuccess={onPRReviewSuccess ?? (() => {})}
            onError={onPRReviewError ?? (() => {})}
          />
        )}
        <button
          type="button"
          className="commit-btn"
          onClick={onCommitClick}
          disabled={mode !== "working" || !hasStaged}
        >
          Commit
        </button>
        <button
          type="button"
          className={`view-toggle ${diffStyle === "split" ? "active" : ""}`}
          onClick={() => onDiffStyleChange(diffStyle === "split" ? "unified" : "split")}
          title="Toggle diff view"
        >
          {diffStyle === "split" ? "Split" : "Unified"}
        </button>
        <button
          type="button"
          className="view-toggle"
          onClick={onRefresh}
          title="Refresh"
        >
          <Icon name="refresh" size={14} />
        </button>
      </div>
    </header>
  );
}
