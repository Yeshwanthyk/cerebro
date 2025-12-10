import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Command, CommandPalette } from "./components/CommandPalette";
import { FileCard } from "./components/FileCard";
import { Icon } from "./components/Icon";
import { Modal } from "./components/Modal";
import { RepoPicker } from "./components/RepoPicker";
import { useDiff } from "./hooks/useDiff";
import { useRepos } from "./hooks/useRepos";
import { buildCommentThreads } from "./utils/commentThreads";

const HALF_PAGE_SIZE = 10;

export default function App() {
  const {
    repos,
    currentRepo,
    loading: reposLoading,
    error: reposError,
    setCurrentRepo,
    addRepo,
    removeRepo,
  } = useRepos();

  const {
    diff,
    comments,
    notes,
    loading,
    error,
    mode,
    setMode,
    branches,
    compareBranch,
    setCompareBranch,
    toggleViewed,
    addComment,
    resolveComment,
    dismissNote,
    stageFile,
    unstageFile,
    discardFile,
    commit,
    loadFileDiff,
    refresh,
  } = useDiff(currentRepo);

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Clear expanded files when mode or compare branch changes (file list changes)
  useEffect(() => {
    setExpandedFiles(new Set());
    setFocusedIndex(0);
  }, [mode, compareBranch, currentRepo]);
  const [diffStyle, setDiffStyle] = useState<"split" | "unified">("unified");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [activeComment, setActiveComment] = useState<{
    filePath: string;
    lineNumber: number;
    content: string;
  } | null>(null);
  const [showBranchPicker, setShowBranchPicker] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // For vim multi-key sequences (gg)
  const lastKeyRef = useRef<string | null>(null);
  const lastKeyTimeRef = useRef<number>(0);

  // Close branch picker on click outside
  useEffect(() => {
    if (!showBranchPicker) {
      return;
    }
    const handleClickOutside = () => setShowBranchPicker(false);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showBranchPicker]);

  const files = useMemo(() => {
    const raw = diff?.files ?? [];
    return [...raw].sort((a, b) => {
      // Staged files first (in working mode)
      if (a.staged !== b.staged) {
        return a.staged ? -1 : 1;
      }
      // Then sort by path (groups directories together)
      return a.path.localeCompare(b.path);
    });
  }, [diff?.files]);

  const toggleFile = useCallback(
    async (path: string) => {
      const file = files.find((f) => f.path === path);
      const isExpanding = !expandedFiles.has(path);

      // If expanding and file has no patch loaded (lazy loading), load it first
      if (isExpanding && file && !file.patch) {
        setLoadingFiles((prev) => new Set(prev).add(path));
        await loadFileDiff(path);
        setLoadingFiles((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }

      setExpandedFiles((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return next;
      });
    },
    [expandedFiles, files, loadFileDiff],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // CMD+K opens command palette (works even in inputs)
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShowCommandPalette((s) => !s);
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const now = Date.now();
      const lastKey = lastKeyRef.current;
      const timeSinceLastKey = now - lastKeyTimeRef.current;

      // Check for multi-key sequences (within 500ms)
      if (lastKey === "g" && e.key === "g" && timeSinceLastKey < 500) {
        // gg - go to first file
        e.preventDefault();
        setFocusedIndex(0);
        lastKeyRef.current = null;
        return;
      }

      // Store this key for potential sequence
      lastKeyRef.current = e.key;
      lastKeyTimeRef.current = now;

      const focusedFile = files[focusedIndex];

      switch (e.key) {
        case "j":
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, files.length - 1));
          break;
        case "k":
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          break;
        case "o":
        case "Enter":
        case "l":
          e.preventDefault();
          // Expand/toggle file
          if (focusedFile) {
            void toggleFile(focusedFile.path);
          }
          break;
        case "h":
          e.preventDefault();
          // Collapse file
          if (focusedFile && expandedFiles.has(focusedFile.path)) {
            setExpandedFiles((prev) => {
              const next = new Set(prev);
              next.delete(focusedFile.path);
              return next;
            });
          }
          break;
        case "g":
          // First part of gg sequence - prevent sound
          e.preventDefault();
          break;
        case "G":
          e.preventDefault();
          // Go to last file
          if (files.length > 0) {
            setFocusedIndex(files.length - 1);
          }
          break;
        case "d":
          // Ctrl+d - half page down
          if (e.ctrlKey) {
            e.preventDefault();
            setFocusedIndex((i) => Math.min(i + HALF_PAGE_SIZE, files.length - 1));
          }
          break;
        case "u":
          // Ctrl+u - half page up, or unstage (in working mode, for staged files)
          if (e.ctrlKey) {
            e.preventDefault();
            setFocusedIndex((i) => Math.max(i - HALF_PAGE_SIZE, 0));
          } else if (focusedFile && mode === "working" && focusedFile.staged) {
            e.preventDefault();
            void unstageFile(focusedFile.path);
          }
          break;
        case "v":
          e.preventDefault();
          // Toggle viewed
          if (focusedFile) {
            void toggleViewed(focusedFile.path, focusedFile.viewed);
          }
          break;
        case "s":
          e.preventDefault();
          // Stage file (only unstaged files)
          if (focusedFile && mode === "working" && !focusedFile.staged) {
            void stageFile(focusedFile.path);
          }
          break;
        case "x":
          e.preventDefault();
          // Discard with confirmation
          if (focusedFile && mode === "working") {
            setConfirmDiscard(focusedFile.path);
          }
          break;
        case "1":
          e.preventDefault();
          setMode("branch");
          break;
        case "2":
          e.preventDefault();
          setMode("working");
          break;
        case "?":
          e.preventDefault();
          setShowShortcuts((s) => !s);
          break;
        case "t":
          e.preventDefault();
          setDiffStyle((s) => (s === "split" ? "unified" : "split"));
          break;
        case "c":
          e.preventDefault();
          if (mode === "working" && files.some((f) => f.staged)) {
            setShowCommitModal(true);
          }
          break;
        case "Escape":
          e.preventDefault();
          setShowShortcuts(false);
          setShowCommitModal(false);
          setConfirmDiscard(null);
          setActiveComment(null);
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, [
    files,
    focusedIndex,
    expandedFiles,
    mode,
    toggleFile,
    toggleViewed,
    stageFile,
    unstageFile,
    setMode,
  ]);

  const commentThreadsByFile = useMemo(() => {
    const byFile = new Map<string, ReturnType<typeof buildCommentThreads>>();
    const activeComments = comments?.filter((c) => !c.resolved) ?? [];
    const grouped = activeComments.reduce<Record<string, typeof activeComments>>((acc, comment) => {
      acc[comment.file_path] ??= [];
      acc[comment.file_path]?.push(comment);
      return acc;
    }, {});

    for (const [filePath, fileComments] of Object.entries(grouped)) {
      byFile.set(filePath, buildCommentThreads(fileComments));
    }
    return byFile;
  }, [comments]);

  const getCommentsForFile = (path: string) => (comments ?? []).filter((c) => c.file_path === path);
  const getCommentThreadsForFile = (path: string) => commentThreadsByFile.get(path) ?? [];
  const getNotesForFile = (path: string) =>
    (notes ?? []).filter(
      (n) => (n.file_path === path || n.file_path.endsWith(`/${path}`)) && !n.dismissed,
    );

  // Command palette commands
  const commands: Command[] = useMemo(() => {
    const focusedFile = files[focusedIndex];
    const stagedCount = files.filter((f) => f.staged).length;

    return [
      // File commands
      ...files.map((file, index) => ({
        id: `file-${file.path}`,
        label: file.path,
        category: "files" as const,
        action: () => {
          setFocusedIndex(index);
          void toggleFile(file.path);
        },
      })),

      // Actions
      {
        id: "toggle-viewed",
        label: focusedFile?.viewed ? "Mark as unreviewed" : "Mark as reviewed",
        shortcut: "v",
        category: "actions" as const,
        action: () => focusedFile && void toggleViewed(focusedFile.path, focusedFile.viewed),
        disabled: !focusedFile,
      },
      {
        id: "stage-file",
        label: "Stage file",
        shortcut: "s",
        category: "actions" as const,
        action: () => focusedFile && void stageFile(focusedFile.path),
        disabled: !focusedFile || mode !== "working" || focusedFile.staged,
      },
      {
        id: "unstage-file",
        label: "Unstage file",
        shortcut: "u",
        category: "actions" as const,
        action: () => focusedFile && void unstageFile(focusedFile.path),
        disabled: !focusedFile || mode !== "working" || !focusedFile.staged,
      },
      {
        id: "discard-file",
        label: "Discard changes",
        shortcut: "x",
        category: "actions" as const,
        action: () => focusedFile && setConfirmDiscard(focusedFile.path),
        disabled: !focusedFile || mode !== "working",
      },
      {
        id: "commit",
        label: "Commit staged changes",
        shortcut: "c",
        category: "actions" as const,
        action: () => setShowCommitModal(true),
        disabled: mode !== "working" || stagedCount === 0,
      },
      {
        id: "refresh",
        label: "Refresh",
        category: "actions" as const,
        action: () => void refresh(),
      },

      // Navigation
      {
        id: "go-first",
        label: "Go to first file",
        shortcut: "gg",
        category: "navigation" as const,
        action: () => setFocusedIndex(0),
        disabled: files.length === 0,
      },
      {
        id: "go-last",
        label: "Go to last file",
        shortcut: "G",
        category: "navigation" as const,
        action: () => setFocusedIndex(files.length - 1),
        disabled: files.length === 0,
      },
      {
        id: "expand-file",
        label: "Expand file",
        shortcut: "l",
        category: "navigation" as const,
        action: () => focusedFile && void toggleFile(focusedFile.path),
        disabled: !focusedFile || expandedFiles.has(focusedFile.path),
      },
      {
        id: "collapse-file",
        label: "Collapse file",
        shortcut: "h",
        category: "navigation" as const,
        action: () => {
          if (focusedFile && expandedFiles.has(focusedFile.path)) {
            setExpandedFiles((prev) => {
              const next = new Set(prev);
              next.delete(focusedFile.path);
              return next;
            });
          }
        },
        disabled: !focusedFile || !expandedFiles.has(focusedFile.path),
      },

      // Settings
      {
        id: "branch-mode",
        label: "Switch to Branch mode",
        shortcut: "1",
        category: "settings" as const,
        action: () => setMode("branch"),
        disabled: mode === "branch",
      },
      {
        id: "working-mode",
        label: "Switch to Working mode",
        shortcut: "2",
        category: "settings" as const,
        action: () => setMode("working"),
        disabled: mode === "working",
      },
      {
        id: "toggle-diff-style",
        label: diffStyle === "split" ? "Switch to Unified view" : "Switch to Split view",
        shortcut: "t",
        category: "settings" as const,
        action: () => setDiffStyle((s) => (s === "split" ? "unified" : "split")),
      },
      {
        id: "show-shortcuts",
        label: "Show keyboard shortcuts",
        shortcut: "?",
        category: "settings" as const,
        action: () => setShowShortcuts(true),
      },
    ];
  }, [
    files,
    focusedIndex,
    mode,
    diffStyle,
    expandedFiles,
    toggleFile,
    toggleViewed,
    stageFile,
    unstageFile,
    refresh,
    setMode,
  ]);

  const handleToggleViewed = async (path: string, viewed: boolean) => {
    try {
      await toggleViewed(path, viewed);
    } catch {
      // ignore
    }
  };

  const handleResolveComment = async (id: string) => {
    try {
      await resolveComment(id);
    } catch {
      // ignore
    }
  };

  const handleDismissNote = async (id: string) => {
    try {
      await dismissNote(id);
    } catch {
      // ignore
    }
  };

  const handleStage = async (path: string) => {
    try {
      await stageFile(path);
    } catch {
      // ignore
    }
  };

  const handleUnstage = async (path: string) => {
    try {
      await unstageFile(path);
    } catch {
      // ignore
    }
  };

  const handleDiscard = async (path: string) => {
    try {
      await discardFile(path);
      setConfirmDiscard(null);
    } catch {
      // ignore
    }
  };

  const handleCommit = async (message: string) => {
    if (!message.trim()) {
      return;
    }
    try {
      await commit(message);
      setCommitMessage("");
      setShowCommitModal(false);
    } catch {
      // ignore
    }
  };

  const handleAddComment = async (text: string) => {
    if (!activeComment) {
      return;
    }
    try {
      await addComment(
        activeComment.filePath,
        activeComment.lineNumber,
        text,
        activeComment.content,
      );
      setActiveComment(null);
    } catch {
      // ignore
    }
  };

  const handleRepoSelect = async (id: string) => {
    try {
      await setCurrentRepo(id);
    } catch {
      // ignore
    }
  };

  const handleAddRepo = async (path: string) => {
    await addRepo(path);
  };

  const handleRemoveRepo = async (id: string) => {
    try {
      await removeRepo(id);
    } catch {
      // ignore
    }
  };

  // Show welcome screen if no repos or no current repo selected
  if (!reposLoading && (repos.length === 0 || !currentRepo)) {
    return (
      <div className="welcome">
        <img src="/images/Cerebro.png" alt="Cerebro" className="welcome-logo" />
        <h1>Cerebro</h1>
        <p>Git diff review tool</p>
        <div className="welcome-content">
          <p>
            {repos.length === 0
              ? "No repositories tracked yet."
              : "Select a repository to get started."}
          </p>
          <p className="muted">{repos.length === 0 ? "Add a repository to get started:" : ""}</p>
          <RepoPicker
            repos={repos}
            currentRepo={currentRepo}
            onSelect={handleRepoSelect}
            onAdd={handleAddRepo}
            onRemove={handleRemoveRepo}
          />
        </div>
      </div>
    );
  }

  if (reposLoading || loading) {
    return (
      <div className="loading">
        <img src="/images/Cerebro.png" alt="Cerebro" className="loading-logo" />
        <p>
          <strong>Loading...</strong>
        </p>
      </div>
    );
  }

  if (reposError || error) {
    return (
      <div className="error">
        <h2>Error</h2>
        <p>{reposError ?? error}</p>
      </div>
    );
  }

  const viewedCount = files.filter((f) => f.viewed).length;
  const fileCount = files.length;
  const progressPercent = fileCount > 0 ? (viewedCount / fileCount) * 100 : 0;
  const currentRepoData = repos.find((r) => r.id === currentRepo);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <img src="/images/Cerebro.png" alt="Cerebro" className="header-logo" />
          <RepoPicker
            repos={repos}
            currentRepo={currentRepo}
            onSelect={handleRepoSelect}
            onAdd={handleAddRepo}
            onRemove={handleRemoveRepo}
          />
          <div className="header-separator" />
          <div className="mode-switcher">
            <button
              type="button"
              className={mode === "branch" ? "active" : ""}
              onClick={() => setMode("branch")}
            >
              Branch
            </button>
            <button
              type="button"
              className={mode === "working" ? "active" : ""}
              onClick={() => setMode("working")}
            >
              Working
            </button>
          </div>
          <span className="branch">{diff?.branch}</span>
          {mode === "branch" && (
            <div className="branch-selector">
              <span className="compare-label">vs</span>
              <button
                type="button"
                className="branch-selector-btn"
                onClick={() => setShowBranchPicker(!showBranchPicker)}
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
                      className={
                        b === (compareBranch ?? currentRepoData?.baseBranch) ? "active" : ""
                      }
                      onClick={() => {
                        setCompareBranch(b);
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
        </div>
        <div className="header-right">
          <button
            type="button"
            className="commit-btn"
            onClick={() => setShowCommitModal(true)}
            disabled={mode !== "working" || !files.some((f) => f.staged)}
          >
            Commit
          </button>
          <button
            type="button"
            className={`view-toggle ${diffStyle === "split" ? "active" : ""}`}
            onClick={() => {
              setDiffStyle(diffStyle === "split" ? "unified" : "split");
            }}
            title="Toggle diff view"
          >
            {diffStyle === "split" ? "Split" : "Unified"}
          </button>
          <button
            type="button"
            className="view-toggle"
            onClick={() => void refresh()}
            title="Refresh"
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
      </header>

      {fileCount > 0 && (
        <div className="progress">
          <span>
            <strong>{viewedCount}</strong> of {fileCount} files reviewed
          </span>
          <span className="shortcut-hint">Press ⌘K for commands, ? for shortcuts</span>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${String(progressPercent)}%` }} />
          </div>
        </div>
      )}

      <main className="file-list">
        {fileCount === 0 ? (
          <div className="empty">
            <p>No changes</p>
            <p className="muted">Your branch is up to date</p>
          </div>
        ) : (
          files.map((file, index) => (
              <FileCard
                key={file.path}
                file={file}
                comments={getCommentsForFile(file.path)}
                commentThreads={getCommentThreadsForFile(file.path)}
                notes={getNotesForFile(file.path)}
                diffStyle={diffStyle}
              isExpanded={expandedFiles.has(file.path)}
              isLoading={loadingFiles.has(file.path)}
              isFocused={index === focusedIndex}
              mode={mode}
              onToggle={() => {
                void toggleFile(file.path);
                setFocusedIndex(index);
              }}
              onToggleViewed={() => void handleToggleViewed(file.path, file.viewed)}
              onResolveComment={(id) => void handleResolveComment(id)}
              onDismissNote={(id) => void handleDismissNote(id)}
              onStage={() => void handleStage(file.path)}
              onUnstage={() => void handleUnstage(file.path)}
              onDiscard={() => {
                setConfirmDiscard(file.path);
              }}
              onLineClick={(lineNumber, content) => {
                setActiveComment({ filePath: file.path, lineNumber, content });
              }}
            />
          ))
        )}
      </main>

      {showShortcuts && (
        <Modal
          onClose={() => setShowShortcuts(false)}
          className="shortcuts-modal"
          aria-labelledby="shortcuts-title"
        >
          <h3 id="shortcuts-title">Keyboard Shortcuts</h3>
          <h4>Navigation</h4>
          <ul>
            <li>
              <kbd>j</kbd> / <kbd>k</kbd> Next / previous file
            </li>
            <li>
              <kbd>gg</kbd> First file
            </li>
            <li>
              <kbd>G</kbd> Last file
            </li>
            <li>
              <kbd>Ctrl+d</kbd> / <kbd>Ctrl+u</kbd> Half-page down / up
            </li>
            <li>
              <kbd>l</kbd> / <kbd>Enter</kbd> Expand file
            </li>
            <li>
              <kbd>h</kbd> Collapse file
            </li>
            <li>
              <kbd>o</kbd> Toggle file
            </li>
          </ul>
          <h4>Actions</h4>
          <ul>
            <li>
              <kbd>v</kbd> Toggle reviewed
            </li>
            <li>
              <kbd>s</kbd> Stage file
            </li>
            <li>
              <kbd>u</kbd> Unstage file
            </li>
            <li>
              <kbd>x</kbd> Discard changes
            </li>
            <li>
              <kbd>c</kbd> Commit staged
            </li>
          </ul>
          <h4>Modes</h4>
          <ul>
            <li>
              <kbd>1</kbd> Branch mode
            </li>
            <li>
              <kbd>2</kbd> Working mode
            </li>
            <li>
              <kbd>t</kbd> Toggle split/unified
            </li>
            <li>
              <kbd>?</kbd> Toggle shortcuts
            </li>
            <li>
              <kbd>⌘</kbd>
              <kbd>K</kbd> Command palette
            </li>
          </ul>
        </Modal>
      )}

      {confirmDiscard && (
        <Modal onClose={() => setConfirmDiscard(null)} className="confirm-modal">
          <p>
            Discard changes to <strong>{confirmDiscard}</strong>?
          </p>
          <p className="muted">This cannot be undone.</p>
          <div className="modal-actions">
            <button
              type="button"
              onClick={() => {
                setConfirmDiscard(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => void handleDiscard(confirmDiscard)}
            >
              Discard
            </button>
          </div>
        </Modal>
      )}

      {activeComment && (
        <Modal
          onClose={() => setActiveComment(null)}
          className="comment-modal"
          aria-labelledby="comment-title"
        >
          <h3 id="comment-title">Comment on line {activeComment.lineNumber}</h3>
          {activeComment.content && <pre className="code-preview">{activeComment.content}</pre>}
          <textarea
            placeholder="Write your comment..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                const text = e.currentTarget.value.trim();
                if (text) {
                  void handleAddComment(text);
                }
              }
            }}
          />
          <div className="modal-actions">
            <button
              type="button"
              onClick={() => {
                setActiveComment(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => {
                const textarea =
                  e.currentTarget.parentElement?.parentElement?.querySelector("textarea");
                const text = textarea?.value.trim();
                if (text) {
                  void handleAddComment(text);
                }
              }}
            >
              Comment
            </button>
          </div>
        </Modal>
      )}

      {showCommitModal && (
        <Modal
          onClose={() => setShowCommitModal(false)}
          className="commit-modal"
          aria-labelledby="commit-title"
        >
          <h3 id="commit-title">Commit Changes</h3>
          <div className="commit-files">
            <span className="commit-files-count">
              {files.filter((f) => f.staged).length} file
              {files.filter((f) => f.staged).length !== 1 ? "s" : ""} staged
            </span>
            <ul>
              {files
                .filter((f) => f.staged)
                .map((f) => (
                  <li key={f.path}>
                    <span className={`status-dot ${f.status}`} />
                    {f.path}
                  </li>
                ))}
            </ul>
          </div>
          <div className="commit-type-buttons">
            {["feat", "fix", "chore", "docs", "refactor", "test"].map((type) => (
              <button
                key={type}
                type="button"
                className={commitMessage.startsWith(`${type}: `) ? "active" : ""}
                onClick={() => {
                  const msg = commitMessage.replace(/^(feat|fix|chore|docs|refactor|test):\s*/, "");
                  setCommitMessage(`${type}: ${msg}`);
                }}
              >
                {type}
              </button>
            ))}
          </div>
          <textarea
            placeholder="Commit message..."
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                void handleCommit(commitMessage);
              }
            }}
          />
          <div className="modal-actions">
            <span className="modal-hint">⌘+Enter to commit</span>
            <button type="button" onClick={() => setShowCommitModal(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={!commitMessage.trim()}
              onClick={() => void handleCommit(commitMessage)}
            >
              Commit
            </button>
          </div>
        </Modal>
      )}

      {showCommandPalette && (
        <CommandPalette
          commands={commands}
          onClose={() => setShowCommandPalette(false)}
        />
      )}
    </div>
  );
}
