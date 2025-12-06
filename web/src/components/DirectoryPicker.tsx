import { useCallback, useEffect, useRef, useState } from "react";
import "./DirectoryPicker.css";

interface DirectoryEntry {
  name: string;
  path: string;
  type: "directory" | "file";
  isGitRepo: boolean;
}

interface BrowseResponse {
  currentPath: string;
  parentPath: string | null;
  currentIsGitRepo: boolean;
  entries: DirectoryEntry[];
}

interface DirectoryPickerProps {
  onSelect: (path: string) => void;
  onCancel: () => void;
  isAdding?: boolean;
  error?: string | null;
}

const RECENT_PATHS_KEY = "cerebro-recent-paths";
const MAX_RECENT = 5;

function getRecentPaths(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_PATHS_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p): p is string => typeof p === "string");
  } catch {
    return [];
  }
}

function addRecentPath(path: string) {
  const recent = getRecentPaths().filter((p) => p !== path);
  recent.unshift(path);
  localStorage.setItem(RECENT_PATHS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

// Decorative icon component - hidden from screen readers
function Icon({
  d,
  size = 16,
  strokeWidth = 2,
  className,
}: {
  d: string | string[];
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
      className={className}
    >
      {paths.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

// Icon paths
const ICONS = {
  folder: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
  close: "M18 6L6 18M6 6l12 12",
  home: "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  edit: [
    "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",
    "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  ],
  chevron: "M9 18L15 12L9 6",
  check: "M20 6L9 17L4 12",
};

export function DirectoryPicker({ onSelect, onCancel, isAdding, error }: DirectoryPickerProps) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [currentIsGitRepo, setCurrentIsGitRepo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pathInput, setPathInput] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const recentPaths = getRecentPaths();

  const browse = useCallback(async (path?: string) => {
    setLoading(true);
    setSelectedIndex(-1);
    try {
      const url = path ? `/api/browse?path=${encodeURIComponent(path)}` : "/api/browse";
      const res = await fetch(url);
      const data = (await res.json()) as BrowseResponse;
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setEntries(data.entries);
      setCurrentIsGitRepo(data.currentIsGitRepo);
      setPathInput(data.currentPath);
    } catch (err) {
      console.error("Browse failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void browse();
  }, [browse]);

  const handleSelect = () => {
    if (currentIsGitRepo) {
      addRecentPath(currentPath);
      onSelect(currentPath);
    }
  };

  const handleEntryClick = (entry: DirectoryEntry) => {
    if (entry.isGitRepo) {
      addRecentPath(entry.path);
      onSelect(entry.path);
    } else {
      void browse(entry.path);
    }
  };

  const handleEntryDoubleClick = (entry: DirectoryEntry) => {
    void browse(entry.path);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showManualInput) {
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, entries.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, -1));
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < entries.length) {
          const entry = entries[selectedIndex];
          if (entry) {
            if (entry.isGitRepo) {
              handleEntryClick(entry);
            } else {
              void browse(entry.path);
            }
          }
        } else if (currentIsGitRepo) {
          handleSelect();
        }
        break;
      case "Backspace":
        if (parentPath) {
          e.preventDefault();
          void browse(parentPath);
        }
        break;
      case "Escape":
        e.preventDefault();
        onCancel();
        break;
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      void browse(pathInput.trim());
      setShowManualInput(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCancel();
    }
  };

  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[selectedIndex] as HTMLElement;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const pathParts = currentPath.split("/").filter(Boolean);

  return (
    <div
      className="directory-picker-overlay"
      onClick={handleOverlayClick}
      onKeyDown={handleOverlayKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dp-title"
    >
      <div
        ref={dialogRef}
        className="directory-picker"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        role="document"
      >
        <div className="dp-header">
          <div className="dp-title" id="dp-title">
            <Icon d={ICONS.folder} size={20} strokeWidth={1.5} />
            <span>Select Repository</span>
          </div>
          <button type="button" className="dp-close" onClick={onCancel} aria-label="Close dialog">
            <Icon d={ICONS.close} size={18} />
          </button>
        </div>

        {/* Breadcrumb navigation */}
        <nav className="dp-breadcrumb" aria-label="Directory path">
          <button
            type="button"
            className="dp-crumb dp-crumb-root"
            onClick={() => void browse("/")}
            aria-label="Go to root"
          >
            <Icon d={ICONS.home} size={14} />
          </button>
          {pathParts.map((part, i) => {
            const pathKey = pathParts.slice(0, i + 1).join("/");
            return (
              <button
                type="button"
                key={pathKey}
                className="dp-crumb"
                onClick={() => void browse(`/${pathKey}`)}
              >
                <span className="dp-crumb-sep" aria-hidden="true">
                  /
                </span>
                {part}
              </button>
            );
          })}
          <button
            type="button"
            className="dp-edit-path"
            onClick={() => {
              setShowManualInput(true);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            aria-label="Edit path manually"
          >
            <Icon d={ICONS.edit} size={14} />
          </button>
        </nav>

        {showManualInput && (
          <form className="dp-manual-input" onSubmit={handleManualSubmit}>
            <input
              ref={inputRef}
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="/path/to/repository"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Directory path"
            />
            <button type="submit">Go</button>
            <button type="button" onClick={() => setShowManualInput(false)}>
              Cancel
            </button>
          </form>
        )}

        {/* Recent paths */}
        {recentPaths.length > 0 && !loading && entries.length === 0 && (
          <section className="dp-recent" aria-labelledby="recent-repos-heading">
            <h2 id="recent-repos-heading" className="dp-recent-header">
              Recent Repositories
            </h2>
            {recentPaths.map((p) => (
              <button type="button" key={p} className="dp-recent-item" onClick={() => onSelect(p)}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span className="dp-recent-path">{p}</span>
              </button>
            ))}
          </section>
        )}

        {/* Directory listing */}
        <section className="dp-list" ref={listRef} aria-labelledby="dir-list-heading">
          <h2 id="dir-list-heading" className="visually-hidden">
            Directory contents
          </h2>
          {loading ? (
            <output className="dp-loading">
              <div className="dp-spinner" aria-hidden="true" />
              <span>Loading...</span>
            </output>
          ) : entries.length === 0 ? (
            <div className="dp-empty">
              <Icon d={ICONS.folder} size={48} strokeWidth={1} />
              <span>No subdirectories</span>
            </div>
          ) : (
            entries.map((entry, i) => (
              <button
                type="button"
                key={entry.path}
                aria-current={selectedIndex === i ? "true" : undefined}
                className={`dp-entry ${entry.isGitRepo ? "dp-entry-repo" : ""} ${selectedIndex === i ? "dp-entry-selected" : ""}`}
                onClick={() => handleEntryClick(entry)}
                onDoubleClick={() => handleEntryDoubleClick(entry)}
              >
                {entry.isGitRepo ? (
                  <svg
                    className="dp-icon dp-icon-repo"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 3v6M12 15v6" />
                    <path d="M5.63 5.63l4.25 4.25M14.12 14.12l4.25 4.25" />
                    <path d="M3 12h6M15 12h6" />
                    <path d="M5.63 18.37l4.25-4.25M14.12 9.88l4.25-4.25" />
                  </svg>
                ) : (
                  <Icon d={ICONS.folder} size={18} strokeWidth={1.5} className="dp-icon" />
                )}
                <span className="dp-entry-name">{entry.name}</span>
                {entry.isGitRepo && <span className="dp-badge">git</span>}
                <Icon d={ICONS.chevron} size={14} className="dp-chevron" />
              </button>
            ))
          )}
        </section>

        {/* Footer with current selection */}
        <div className="dp-footer">
          {error && (
            <div className="dp-error" role="alert">
              {error}
            </div>
          )}
          <div className="dp-selection">
            {currentIsGitRepo ? (
              <>
                <Icon d={ICONS.check} size={16} className="dp-selection-icon" />
                <span>Git repository detected</span>
              </>
            ) : (
              <span className="dp-hint">
                Navigate to a git repository or select one from the list
              </span>
            )}
          </div>
          <div className="dp-actions">
            <button type="button" className="dp-btn dp-btn-cancel" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className="dp-btn dp-btn-select"
              onClick={handleSelect}
              disabled={!currentIsGitRepo || isAdding}
            >
              {isAdding ? (
                <>
                  <span className="dp-btn-spinner" aria-hidden="true" />
                  Adding...
                </>
              ) : (
                "Add Repository"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
