import type { DiffMode, DiffResponse, FileDiff } from "../../api/types";
import { FileList } from "./FileList";
import { CommitBox } from "./CommitBox";
import "./Sidebar.css";

interface SidebarProps {
  files: FileDiff[];
  selectedPath: string | null;
  focusedIndex: number;
  mode: DiffMode;
  diff: DiffResponse | null;
  compareBranch: string | null;
  onSelectFile: (path: string, index: number) => void;
  onStageAll: () => void;
  onCommit: (message: string) => void;
}

export function Sidebar({
  files,
  selectedPath,
  focusedIndex,
  mode,
  diff,
  compareBranch,
  onSelectFile,
  onStageAll,
  onCommit,
}: SidebarProps) {
  const viewedCount = files.filter((f) => f.viewed).length;
  const stagedCount = files.filter((f) => f.staged).length;

  return (
    <aside className="sidebar">
      {/* Branch info for branch mode */}
      {mode === "branch" && diff?.branch && (
        <div className="sidebar-branch-info">
          <span className="branch-name">{diff.branch}</span>
          <span className="branch-arrow">→</span>
          <span className="branch-target">{compareBranch ?? "main"}</span>
        </div>
      )}

      {/* Progress */}
      <div className="sidebar-progress">
        <span className="progress-text">
          <strong>{viewedCount}</strong> of <strong>{files.length}</strong> reviewed
        </span>
      </div>

      {/* File list */}
      <div className="sidebar-files">
        {files.length === 0 ? (
          <div className="sidebar-empty">
            {mode === "working" && <span>No uncommitted changes</span>}
            {mode === "branch" && <span>No changes from base</span>}
            {mode === "pr" && <span>Select a PR above</span>}
            {mode === "commit" && <span>Select a commit above</span>}
          </div>
        ) : (
          <FileList
            files={files}
            selectedPath={selectedPath}
            focusedIndex={focusedIndex}
            mode={mode}
            onSelectFile={onSelectFile}
          />
        )}
      </div>

      {/* Commit box - only in working mode */}
      {mode === "working" && (
        <CommitBox
          stagedCount={stagedCount}
          onStageAll={onStageAll}
          onCommit={onCommit}
        />
      )}
    </aside>
  );
}
