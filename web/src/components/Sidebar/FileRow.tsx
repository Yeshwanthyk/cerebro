import type { FileDiff } from "../../api/types";

interface FileRowProps {
  file: FileDiff;
  isSelected: boolean;
  isFocused: boolean;
  onClick: () => void;
}

const STATUS_BADGES: Record<string, { letter: string; className: string }> = {
  added: { letter: "A", className: "status-added" },
  modified: { letter: "M", className: "status-modified" },
  deleted: { letter: "D", className: "status-deleted" },
  renamed: { letter: "R", className: "status-renamed" },
  untracked: { letter: "U", className: "status-untracked" },
};

const DEFAULT_BADGE = { letter: "M", className: "status-modified" };

function getFileName(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  return lastSlash === -1 ? path : path.slice(lastSlash + 1);
}

function getTruncatedPath(path: string, maxLen = 35): string {
  if (path.length <= maxLen) return path;
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  
  // Try progressively shorter paths
  let truncated = path;
  for (let i = 0; i < parts.length - 1; i++) {
    const remaining = parts.slice(i);
    truncated = `…/${remaining.join("/")}`;
    if (truncated.length <= maxLen) break;
  }
  return truncated;
}

export function FileRow({ file, isSelected, isFocused, onClick }: FileRowProps) {
  const badge = STATUS_BADGES[file.status] ?? DEFAULT_BADGE;
  const fileName = getFileName(file.path);
  const truncatedPath = getTruncatedPath(file.path);
  const showPath = truncatedPath !== fileName;

  return (
    <button
      type="button"
      className={`file-row ${isSelected ? "selected" : ""} ${isFocused ? "focused" : ""}`}
      onClick={onClick}
      title={file.path}
    >
      <span className="file-row-content">
        {file.viewed && <span className="reviewed-mark">✓</span>}
        <span className="file-row-name">{fileName}</span>
        {showPath && <span className="file-row-path">{truncatedPath}</span>}
      </span>
      <span className={`file-row-badge ${badge.className}`}>{badge.letter}</span>
    </button>
  );
}
