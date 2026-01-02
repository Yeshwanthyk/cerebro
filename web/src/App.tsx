import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Command, CommandPalette } from "./components/CommandPalette";
import { FileCard } from "./components/FileCard";
import { RepoPicker } from "./components/RepoPicker";
import { Header } from "./components/Header";
import { Progress } from "./components/Progress";
import {
  ShortcutsModal,
  ConfirmDiscardModal,
  CommentModal,
  CommitModal,
} from "./components/Modals";
import { useDiff } from "./hooks/useDiff";
import { usePRs } from "./hooks/usePRs";
import { useRepos } from "./hooks/useRepos";
import { buildCommentThreads } from "./utils/commentThreads";
import { PRPicker } from "./components/PRPicker";

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
    setPrNumber,
  } = useDiff(currentRepo);

  const {
    prs,
    loading: prsLoading,
    error: prsError,
    filter: prFilter,
    setFilter: setPrFilter,
    selectedPR,
    setSelectedPR,
    refresh: refreshPRs,
  } = usePRs(currentRepo);

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Clear expanded files when mode or compare branch changes
  const prevModeRef = useRef(mode);
  const prevBranchRef = useRef(compareBranch);
  const prevRepoRef = useRef(currentRepo);
  useEffect(() => {
    if (prevModeRef.current !== mode || prevBranchRef.current !== compareBranch || prevRepoRef.current !== currentRepo) {
      prevModeRef.current = mode;
      prevBranchRef.current = compareBranch;
      prevRepoRef.current = currentRepo;
      setExpandedFiles(new Set());
      setFocusedIndex(0);
    }
  }, [mode, compareBranch, currentRepo]);

  // Sync PR selection with diff hook
  useEffect(() => {
    if (mode === "pr" && selectedPR !== null) {
      setPrNumber(selectedPR);
    }
  }, [mode, selectedPR, setPrNumber]);

  // Clear PR selection when leaving PR mode
  useEffect(() => {
    if (mode !== "pr") {
      setSelectedPR(null);
    }
  }, [mode, setSelectedPR]);

  const [diffStyle, setDiffStyle] = useState<"split" | "unified">("unified");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [modeCounts, setModeCounts] = useState<{ branch: number | null; working: number | null; pr: number | null }>({
    branch: null,
    working: null,
    pr: null,
  });

  // Fetch counts for all modes
  useEffect(() => {
    if (!currentRepo) return;

    const fetchCounts = async () => {
      try {
        // Fetch working count
        const workingRes = await fetch(`/api/diff?repo=${currentRepo}&mode=working`);
        if (workingRes.ok) {
          const data = await workingRes.json() as { files?: unknown[] };
          setModeCounts((prev) => ({ ...prev, working: data.files?.length ?? 0 }));
        }

        // Fetch branch count
        const branchRes = await fetch(`/api/diff?repo=${currentRepo}&mode=branch`);
        if (branchRes.ok) {
          const data = await branchRes.json() as { files?: unknown[] };
          setModeCounts((prev) => ({ ...prev, branch: data.files?.length ?? 0 }));
        }

        // PR count comes from prs array
        setModeCounts((prev) => ({ ...prev, pr: prs.length > 0 ? prs.length : null }));
      } catch {
        // ignore errors
      }
    };

    void fetchCounts();
  }, [currentRepo, prs.length]);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification !== null) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);
  const [showCommitModal, setShowCommitModal] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [activeComment, setActiveComment] = useState<{
    filePath: string;
    lineNumber: number;
    content: string;
  } | null>(null);
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  // For vim multi-key sequences (gg)
  const lastKeyRef = useRef<string | null>(null);
  const lastKeyTimeRef = useRef<number>(0);

  const files = useMemo(() => {
    const raw = diff?.files ?? [];
    return [...raw].sort((a, b) => {
      if (a.staged !== b.staged) return a.staged ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
  }, [diff?.files]);

  const toggleFile = useCallback(
    async (path: string) => {
      const file = files.find((f) => f.path === path);
      const isExpanding = !expandedFiles.has(path);

      // Load full file diff if:
      // - No patch yet, OR
      // - PR mode and no file contents (need to fetch from GitHub)
      const needsLoad = !file?.patch || 
        (mode === "pr" && !file?.old_file?.contents && !file?.new_file?.contents);

      if (isExpanding && file && needsLoad) {
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
    [expandedFiles, files, loadFileDiff, mode],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShowCommandPalette((s) => !s);
        return;
      }

      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Let j/k pass through for natural scrolling
      if (e.key === "j" || e.key === "k") {
        return;
      }

      const now = Date.now();
      const lastKey = lastKeyRef.current;
      const timeSinceLastKey = now - lastKeyTimeRef.current;

      if (lastKey === "g" && e.key === "g" && timeSinceLastKey < 500) {
        e.preventDefault();
        setFocusedIndex(0);
        lastKeyRef.current = null;
        return;
      }

      lastKeyRef.current = e.key;
      lastKeyTimeRef.current = now;

      const focusedFile = files[focusedIndex];

      switch (e.key) {
        case "J":
          e.preventDefault();
          setFocusedIndex((i) => Math.min(i + 1, files.length - 1));
          break;
        case "K":
          e.preventDefault();
          setFocusedIndex((i) => Math.max(i - 1, 0));
          break;
        case "o":
        case "Enter":
          e.preventDefault();
          if (focusedFile) void toggleFile(focusedFile.path);
          break;
        case "G":
          e.preventDefault();
          if (e.shiftKey && files.length > 0) setFocusedIndex(files.length - 1);
          break;
        case "u":
          if (focusedFile && mode === "working" && focusedFile.staged) {
            e.preventDefault();
            void unstageFile(focusedFile.path);
          }
          break;
        case "v":
          e.preventDefault();
          if (focusedFile) void toggleViewed(focusedFile.path, focusedFile.viewed);
          break;
        case "s":
          e.preventDefault();
          if (focusedFile && mode === "working" && !focusedFile.staged) {
            void stageFile(focusedFile.path);
          }
          break;
        case "x":
          e.preventDefault();
          if (focusedFile && mode === "working") setConfirmDiscard(focusedFile.path);
          break;
        case "1":
          e.preventDefault();
          setMode("working");
          break;
        case "2":
          e.preventDefault();
          setMode("branch");
          break;
        case "3":
          e.preventDefault();
          setMode("pr");
          break;
        case "r":
          e.preventDefault();
          void refresh();
          if (mode === "pr") void refreshPRs();
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
          if (mode === "working" && files.some((f) => f.staged)) setShowCommitModal(true);
          break;
        case "Escape":
          e.preventDefault();
          // Close modals first, then expanded files
          if (showShortcuts || showCommitModal || confirmDiscard !== null || activeComment !== null) {
            setShowShortcuts(false);
            setShowCommitModal(false);
            setConfirmDiscard(null);
            setActiveComment(null);
          } else if (expandedFiles.size > 0) {
            setExpandedFiles(new Set());
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [files, focusedIndex, expandedFiles, mode, toggleFile, toggleViewed, stageFile, unstageFile, setMode, refresh, refreshPRs, showShortcuts, showCommitModal, confirmDiscard, activeComment]);

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
      ...repos.map((repo) => ({
        id: `switch-repo-${repo.id}`,
        label: repo.name,
        category: "projects" as const,
        action: () => void setCurrentRepo(repo.id),
        disabled: repo.id === currentRepo,
      })),
      ...files.map((file, index) => ({
        id: `file-${file.path}`,
        label: file.path,
        category: "files" as const,
        action: () => {
          setFocusedIndex(index);
          void toggleFile(file.path);
        },
      })),
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
        shortcut: "r",
        category: "actions" as const,
        action: () => void refresh(),
      },
      {
        id: "next-file",
        label: "Next file",
        shortcut: "J",
        category: "navigation" as const,
        action: () => setFocusedIndex((i) => Math.min(i + 1, files.length - 1)),
        disabled: files.length === 0,
      },
      {
        id: "prev-file",
        label: "Previous file",
        shortcut: "K",
        category: "navigation" as const,
        action: () => setFocusedIndex((i) => Math.max(i - 1, 0)),
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
        id: "toggle-file",
        label: "Toggle file",
        shortcut: "Enter",
        category: "navigation" as const,
        action: () => focusedFile && void toggleFile(focusedFile.path),
        disabled: !focusedFile,
      },
      {
        id: "collapse-all",
        label: "Collapse all files",
        shortcut: "Esc",
        category: "navigation" as const,
        action: () => setExpandedFiles(new Set()),
        disabled: expandedFiles.size === 0,
      },
      {
        id: "local-mode",
        label: "Switch to Local mode",
        shortcut: "1",
        category: "settings" as const,
        action: () => setMode("working"),
        disabled: mode === "working",
      },
      {
        id: "branch-mode",
        label: "Switch to Branch mode",
        shortcut: "2",
        category: "settings" as const,
        action: () => setMode("branch"),
        disabled: mode === "branch",
      },
      {
        id: "pr-mode",
        label: "Switch to PRs mode",
        shortcut: "3",
        category: "settings" as const,
        action: () => setMode("pr"),
        disabled: mode === "pr",
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
  }, [repos, currentRepo, setCurrentRepo, files, focusedIndex, mode, diffStyle, expandedFiles, toggleFile, toggleViewed, stageFile, unstageFile, refresh, setMode]);

  // Event handlers
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

  const handleDiscard = async (path: string) => {
    try {
      await discardFile(path);
      setConfirmDiscard(null);
    } catch {
      // ignore
    }
  };

  const handleCommit = async (message: string) => {
    if (!message.trim()) return;
    try {
      await commit(message);
      setShowCommitModal(false);
    } catch {
      // ignore
    }
  };

  const handleAddComment = async (text: string) => {
    if (!activeComment) return;
    try {
      await addComment(activeComment.filePath, activeComment.lineNumber, text, activeComment.content);
      setActiveComment(null);
    } catch {
      // ignore
    }
  };

  // Welcome screen
  if (!reposLoading && (repos.length === 0 || !currentRepo)) {
    return (
      <div className="welcome">
        <img src="/images/Cerebro.png" alt="Cerebro" className="welcome-logo" />
        <h1>Cerebro</h1>
        <p>Git diff review tool</p>
        <div className="welcome-content">
          <p>{repos.length === 0 ? "No repositories tracked yet." : "Select a repository to get started."}</p>
          <p className="muted">{repos.length === 0 ? "Add a repository to get started:" : ""}</p>
          <RepoPicker
            repos={repos}
            currentRepo={currentRepo ?? null}
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
        <p><strong>Loading...</strong></p>
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
  const stagedFiles = files.filter((f) => f.staged);

  return (
    <div className="app">
      <Header
        repos={repos}
        currentRepo={currentRepo ?? null}
        diff={diff}
        mode={mode}
        diffStyle={diffStyle}
        branches={branches}
        compareBranch={compareBranch}
        hasStaged={stagedFiles.length > 0}
        modeCounts={modeCounts}
        onRepoSelect={handleRepoSelect}
        onAddRepo={handleAddRepo}
        onRemoveRepo={handleRemoveRepo}
        onModeChange={setMode}
        onDiffStyleChange={setDiffStyle}
        onCompareBranchChange={setCompareBranch}
        onCommitClick={() => setShowCommitModal(true)}
        onRefresh={() => void refresh()}
        onPRReviewSuccess={(msg) => setNotification({ type: "success", message: msg })}
        onPRReviewError={(msg) => setNotification({ type: "error", message: msg })}
      />

      {notification !== null && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
          <button type="button" onClick={() => setNotification(null)}>×</button>
        </div>
      )}

      <Progress viewedCount={viewedCount} totalCount={files.length} />

      {mode === "pr" && (
        <PRPicker
          prs={prs}
          loading={prsLoading}
          error={prsError}
          filter={prFilter}
          selectedPR={selectedPR}
          onFilterChange={setPrFilter}
          onSelectPR={(pr) => {
            setSelectedPR(pr);
          }}
          onClearSelection={() => {
            setSelectedPR(null);
            setPrNumber(null);
          }}
          onRefresh={() => void refreshPRs()}
        />
      )}

      <main className="file-list">
        {files.length === 0 ? (
          <div className="empty">
            {mode === "working" && (
              <>
                <p>No uncommitted changes</p>
                <p className="muted">Working directory is clean</p>
              </>
            )}
            {mode === "branch" && diff?.branch === (compareBranch ?? "main") && (
              <>
                <p>You're on {diff?.branch ?? "main"}</p>
                <p className="muted">Switch to a feature branch to see diff</p>
              </>
            )}
            {mode === "branch" && diff?.branch !== (compareBranch ?? "main") && (
              <>
                <p>Branch is up to date</p>
                <p className="muted">No commits ahead of {compareBranch ?? "main"}</p>
              </>
            )}
            {mode === "pr" && selectedPR === null && (
              <>
                <p>Select a PR to review</p>
                <p className="muted">Choose from the list above</p>
              </>
            )}
            {mode === "pr" && selectedPR !== null && (
              <>
                <p>No files in this PR</p>
                <p className="muted">This PR has no changed files</p>
              </>
            )}
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
              onToggleViewed={() => void toggleViewed(file.path, file.viewed)}
              onResolveComment={(id) => void resolveComment(id)}
              onDismissNote={(id) => void dismissNote(id)}
              onStage={() => void stageFile(file.path)}
              onUnstage={() => void unstageFile(file.path)}
              onDiscard={() => setConfirmDiscard(file.path)}
              onLineClick={(lineNumber, content) => {
                setActiveComment({ filePath: file.path, lineNumber, content });
              }}
            />
          ))
        )}
      </main>

      {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}

      {confirmDiscard && (
        <ConfirmDiscardModal
          filePath={confirmDiscard}
          onClose={() => setConfirmDiscard(null)}
          onConfirm={() => void handleDiscard(confirmDiscard)}
        />
      )}

      {activeComment && (
        <CommentModal
          lineNumber={activeComment.lineNumber}
          lineContent={activeComment.content}
          onClose={() => setActiveComment(null)}
          onSubmit={(text) => void handleAddComment(text)}
        />
      )}

      {showCommitModal && (
        <CommitModal
          stagedFiles={stagedFiles}
          onClose={() => setShowCommitModal(false)}
          onCommit={(msg) => void handleCommit(msg)}
        />
      )}

      {showCommandPalette && (
        <CommandPalette commands={commands} onClose={() => setShowCommandPalette(false)} />
      )}
    </div>
  );
}
