import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Command, CommandPalette } from "./components/CommandPalette";
import { RepoPicker } from "./components/RepoPicker";
import { Header } from "./components/Header";
import { Sidebar } from "./components/Sidebar";
import { DiffPanel } from "./components/DiffPanel";
import {
  ShortcutsModal,
  ConfirmDiscardModal,
  CommentModal,
  CommitModal,
} from "./components/Modals";
import { useDiff } from "./hooks/useDiff";
import { usePRs } from "./hooks/usePRs";
import { useCommits } from "./hooks/useCommits";
import { useRepos } from "./hooks/useRepos";
import { buildCommentThreads } from "./utils/commentThreads";
import { PRPicker } from "./components/PRPicker";
import { CommitPicker } from "./components/CommitPicker";

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
    initialLoading,
    error,
    mode,
    setMode,
    branches,
    compareBranch,
    setCompareBranch,
    toggleViewed,
    addComment,
    resolveComment,
    stageFile,
    unstageFile,
    discardFile,
    commit,
    loadFileDiff,
    refresh,
    setPrNumber,
    setCommitSha,
    stageAllFiles,
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

  const {
    commits,
    loading: commitsLoading,
    error: commitsError,
    selectedCommit,
    setSelectedCommit,
    refresh: refreshCommits,
  } = useCommits(currentRepo);

  // Get full PR data for selected PR
  const selectedPRData = prs.find((pr) => pr.number === selectedPR);

  const openPRInBrowser = useCallback(() => {
    if (selectedPRData?.url) {
      const bridge = (window as unknown as { cerebroBridge?: { openURL: (url: string) => void } }).cerebroBridge;
      if (bridge?.openURL) {
        bridge.openURL(selectedPRData.url);
      } else {
        window.open(selectedPRData.url, "_blank");
      }
    }
  }, [selectedPRData]);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState<Set<string>>(new Set());
  const [fileViewModes, setFileViewModes] = useState<Record<string, "patch" | "full">>({});
  const [focusedIndex, setFocusedIndex] = useState(0);

  // Clear state when mode or compare branch changes
  const prevModeRef = useRef(mode);
  const prevBranchRef = useRef(compareBranch);
  const prevRepoRef = useRef(currentRepo);
  useEffect(() => {
    if (prevModeRef.current !== mode || prevBranchRef.current !== compareBranch || prevRepoRef.current !== currentRepo) {
      prevModeRef.current = mode;
      prevBranchRef.current = compareBranch;
      prevRepoRef.current = currentRepo;
      setSelectedPath(null);
      setFileViewModes({});
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

  // Sync commit selection with diff hook
  useEffect(() => {
    if (mode === "commit" && selectedCommit !== null) {
      setCommitSha(selectedCommit);
    }
  }, [mode, selectedCommit, setCommitSha]);

  // Clear commit selection when leaving commit mode
  useEffect(() => {
    if (mode !== "commit") {
      setSelectedCommit(null);
    }
  }, [mode, setSelectedCommit]);

  const [diffStyle, setDiffStyle] = useState<"split" | "unified">("unified");
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [modeCounts, setModeCounts] = useState<{ branch: number | null; working: number | null; pr: number | null; commit: number | null }>({
    branch: null,
    working: null,
    pr: null,
    commit: null,
  });

  // Fetch counts for all modes
  useEffect(() => {
    if (!currentRepo) return;

    const fetchCounts = async () => {
      try {
        const workingRes = await fetch(`/api/diff?repo=${currentRepo}&mode=working`);
        if (workingRes.ok) {
          const data = await workingRes.json() as { files?: unknown[] };
          setModeCounts((prev) => ({ ...prev, working: data.files?.length ?? 0 }));
        }

        const branchRes = await fetch(`/api/diff?repo=${currentRepo}&mode=branch`);
        if (branchRes.ok) {
          const data = await branchRes.json() as { files?: unknown[] };
          setModeCounts((prev) => ({ ...prev, branch: data.files?.length ?? 0 }));
        }

        setModeCounts((prev) => ({ ...prev, pr: prs.length > 0 ? prs.length : null }));
        setModeCounts((prev) => ({ ...prev, commit: commits.length > 0 ? commits.length : null }));
      } catch {
        // ignore errors
      }
    };

    void fetchCounts();
  }, [currentRepo, prs.length, commits.length]);

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

  const selectedFile = useMemo(() => {
    if (!selectedPath) return null;
    return files.find((f) => f.path === selectedPath) ?? null;
  }, [files, selectedPath]);

  // Load file diff when selecting a file
  const selectFile = useCallback(
    async (path: string, index: number) => {
      setSelectedPath(path);
      setFocusedIndex(index);

      const file = files.find((f) => f.path === path);
      const needsLoad = !file?.patch || 
        (mode === "pr" && !file?.old_file?.contents && !file?.new_file?.contents);

      if (file && needsLoad) {
        setLoadingFiles((prev) => new Set(prev).add(path));
        await loadFileDiff(path);
        setLoadingFiles((prev) => {
          const next = new Set(prev);
          next.delete(path);
          return next;
        });
      }
    },
    [files, loadFileDiff, mode],
  );

  const toggleFileViewMode = useCallback(
    async () => {
      if (!selectedPath) return;
      const currentMode = fileViewModes[selectedPath] ?? "patch";
      const nextMode = currentMode === "patch" ? "full" : "patch";

      if (nextMode === "full") {
        const file = files.find((f) => f.path === selectedPath);
        const canLoadFull = file?.status === "modified" || file?.status === "renamed";
        const needsLoad = canLoadFull && (!file?.old_file?.contents || !file?.new_file?.contents);

        if (needsLoad) {
          setLoadingFiles((prev) => new Set(prev).add(selectedPath));
          await loadFileDiff(selectedPath);
          setLoadingFiles((prev) => {
            const next = new Set(prev);
            next.delete(selectedPath);
            return next;
          });
        }
      }

      setFileViewModes((prev) => ({ ...prev, [selectedPath]: nextMode }));
    },
    [fileViewModes, selectedPath, files, loadFileDiff],
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

      const now = Date.now();
      const lastKey = lastKeyRef.current;
      const timeSinceLastKey = now - lastKeyTimeRef.current;

      if (lastKey === "g" && e.key === "g" && timeSinceLastKey < 500) {
        e.preventDefault();
        setFocusedIndex(0);
        if (files[0]) void selectFile(files[0].path, 0);
        lastKeyRef.current = null;
        return;
      }

      lastKeyRef.current = e.key;
      lastKeyTimeRef.current = now;

      const focusedFile = files[focusedIndex];

      switch (e.key) {
        case "j":
          e.preventDefault();
          if (files.length > 0) {
            const newIndex = Math.min(focusedIndex + 1, files.length - 1);
            setFocusedIndex(newIndex);
            const newFile = files[newIndex];
            if (newFile) void selectFile(newFile.path, newIndex);
          }
          break;
        case "k":
          e.preventDefault();
          if (files.length > 0) {
            const newIndex = Math.max(focusedIndex - 1, 0);
            setFocusedIndex(newIndex);
            const newFile = files[newIndex];
            if (newFile) void selectFile(newFile.path, newIndex);
          }
          break;
        case "Enter":
          e.preventDefault();
          if (focusedFile) void selectFile(focusedFile.path, focusedIndex);
          break;
        case "G":
          e.preventDefault();
          if (e.shiftKey && files.length > 0) {
            const lastIndex = files.length - 1;
            setFocusedIndex(lastIndex);
            const lastFile = files[lastIndex];
            if (lastFile) void selectFile(lastFile.path, lastIndex);
          }
          break;
        case "u":
          if (selectedFile && mode === "working" && selectedFile.staged) {
            e.preventDefault();
            void unstageFile(selectedFile.path);
          }
          break;
        case "v":
          e.preventDefault();
          if (selectedFile) void toggleViewed(selectedFile.path, selectedFile.viewed);
          break;
        case "s":
          e.preventDefault();
          if (selectedFile && mode === "working" && !selectedFile.staged) {
            void stageFile(selectedFile.path);
          }
          break;
        case "x":
          e.preventDefault();
          if (selectedFile && mode === "working") setConfirmDiscard(selectedFile.path);
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
          setMode("commit");
          break;
        case "4":
          e.preventDefault();
          setMode("pr");
          break;
        case "r":
          e.preventDefault();
          void refresh();
          if (mode === "pr") void refreshPRs();
          if (mode === "commit") void refreshCommits();
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
        case "O":
          e.preventDefault();
          if (mode === "pr" && selectedPRData?.url) {
            openPRInBrowser();
          }
          break;
        case "Escape":
          e.preventDefault();
          if (showShortcuts || showCommitModal || confirmDiscard !== null || activeComment !== null) {
            setShowShortcuts(false);
            setShowCommitModal(false);
            setConfirmDiscard(null);
            setActiveComment(null);
          } else if (selectedPath) {
            setSelectedPath(null);
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [files, focusedIndex, selectedPath, selectedFile, mode, selectFile, toggleViewed, stageFile, unstageFile, setMode, refresh, refreshPRs, refreshCommits, showShortcuts, showCommitModal, confirmDiscard, activeComment, selectedPRData?.url, openPRInBrowser]);

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
        action: () => void selectFile(file.path, index),
      })),
      {
        id: "toggle-viewed",
        label: selectedFile?.viewed ? "Mark as unreviewed" : "Mark as reviewed",
        shortcut: "v",
        category: "actions" as const,
        action: () => selectedFile && void toggleViewed(selectedFile.path, selectedFile.viewed),
        disabled: !selectedFile,
      },
      {
        id: "stage-file",
        label: "Stage file",
        shortcut: "s",
        category: "actions" as const,
        action: () => selectedFile && void stageFile(selectedFile.path),
        disabled: !selectedFile || mode !== "working" || selectedFile.staged,
      },
      {
        id: "unstage-file",
        label: "Unstage file",
        shortcut: "u",
        category: "actions" as const,
        action: () => selectedFile && void unstageFile(selectedFile.path),
        disabled: !selectedFile || mode !== "working" || !selectedFile.staged,
      },
      {
        id: "discard-file",
        label: "Discard changes",
        shortcut: "x",
        category: "actions" as const,
        action: () => selectedFile && setConfirmDiscard(selectedFile.path),
        disabled: !selectedFile || mode !== "working",
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
        shortcut: "j",
        category: "navigation" as const,
        action: () => {
          const newIndex = Math.min(focusedIndex + 1, files.length - 1);
          const newFile = files[newIndex];
          if (newFile) void selectFile(newFile.path, newIndex);
        },
        disabled: files.length === 0,
      },
      {
        id: "prev-file",
        label: "Previous file",
        shortcut: "k",
        category: "navigation" as const,
        action: () => {
          const newIndex = Math.max(focusedIndex - 1, 0);
          const newFile = files[newIndex];
          if (newFile) void selectFile(newFile.path, newIndex);
        },
        disabled: files.length === 0,
      },
      {
        id: "go-last",
        label: "Go to last file",
        shortcut: "G",
        category: "navigation" as const,
        action: () => {
          const lastIndex = files.length - 1;
          const lastFile = files[lastIndex];
          if (lastFile) void selectFile(lastFile.path, lastIndex);
        },
        disabled: files.length === 0,
      },
      {
        id: "clear-selection",
        label: "Clear selection",
        shortcut: "Esc",
        category: "navigation" as const,
        action: () => setSelectedPath(null),
        disabled: !selectedPath,
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
        id: "commit-mode",
        label: "Switch to Commits mode",
        shortcut: "3",
        category: "settings" as const,
        action: () => setMode("commit"),
        disabled: mode === "commit",
      },
      {
        id: "pr-mode",
        label: "Switch to PRs mode",
        shortcut: "4",
        category: "settings" as const,
        action: () => setMode("pr"),
        disabled: mode === "pr",
      },
      {
        id: "open-pr-github",
        label: "Open PR in GitHub",
        shortcut: "O",
        category: "actions" as const,
        action: openPRInBrowser,
        disabled: !selectedPRData?.url,
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
  }, [repos, currentRepo, setCurrentRepo, files, focusedIndex, mode, diffStyle, selectedFile, selectedPath, selectFile, toggleViewed, stageFile, unstageFile, refresh, setMode, selectedPRData?.url, openPRInBrowser]);

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
      if (selectedPath === path) {
        setSelectedPath(null);
      }
    } catch {
      // ignore
    }
  };

  const handleCommit = async (message: string) => {
    if (!message.trim()) return;
    try {
      await commit(message);
      setShowCommitModal(false);
      setSelectedPath(null);
    } catch {
      // ignore
    }
  };

  const handleSidebarCommit = async (message: string) => {
    await handleCommit(message);
  };

  const handleStageAll = async () => {
    try {
      await stageAllFiles();
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

  if (reposLoading || initialLoading) {
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
          onOpenInBrowser={selectedPRData?.url ? openPRInBrowser : undefined}
        />
      )}

      {mode === "commit" && (
        <CommitPicker
          commits={commits}
          loading={commitsLoading}
          error={commitsError}
          selectedCommit={selectedCommit}
          onSelectCommit={(sha) => {
            setSelectedCommit(sha);
          }}
          onClearSelection={() => {
            setSelectedCommit(null);
            setCommitSha(null);
          }}
          onRefresh={() => void refreshCommits()}
        />
      )}

      <main className="main-layout">
        <Sidebar
          files={files}
          selectedPath={selectedPath}
          focusedIndex={focusedIndex}
          mode={mode}
          diff={diff}
          compareBranch={compareBranch}
          onSelectFile={(path, index) => void selectFile(path, index)}
          onStageAll={() => void handleStageAll()}
          onCommit={(msg) => void handleSidebarCommit(msg)}
        />
        <DiffPanel
          file={selectedFile}
          files={files}
          mode={mode}
          viewMode={selectedPath ? (fileViewModes[selectedPath] ?? "patch") : "patch"}
          diffStyle={diffStyle}
          isLoading={selectedPath ? loadingFiles.has(selectedPath) : false}
          comments={selectedPath ? getCommentsForFile(selectedPath) : []}
          commentThreads={selectedPath ? getCommentThreadsForFile(selectedPath) : []}
          notes={selectedPath ? getNotesForFile(selectedPath) : []}
          onToggleViewMode={() => void toggleFileViewMode()}
          onToggleDiffStyle={() => setDiffStyle((s) => (s === "split" ? "unified" : "split"))}
          onToggleViewed={() => selectedFile && void toggleViewed(selectedFile.path, selectedFile.viewed)}
          onStage={selectedFile && mode === "working" && !selectedFile.staged ? () => void stageFile(selectedFile.path) : undefined}
          onUnstage={selectedFile && mode === "working" && selectedFile.staged ? () => void unstageFile(selectedFile.path) : undefined}
          onDiscard={selectedFile && mode === "working" ? () => setConfirmDiscard(selectedFile.path) : undefined}
          onResolveComment={(id) => void resolveComment(id)}
        />
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
