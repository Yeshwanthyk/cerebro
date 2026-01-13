import { useCallback, useEffect, useRef, useState } from "react";
import type { Comment, DiffResponse, FileDiff, Note } from "../api/types";

type DiffMode = "branch" | "working" | "pr" | "commit";

interface CachedData {
  diff: DiffResponse | null;
  comments: Comment[];
  notes: Note[];
  timestamp: number;
}

interface UseDiffResult {
  diff: DiffResponse | null;
  comments: Comment[];
  notes: Note[];
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  mode: DiffMode;
  setMode: (mode: DiffMode) => void;
  branches: string[];
  compareBranch: string | null;
  setCompareBranch: (branch: string | null) => void;
  prNumber: number | null;
  setPrNumber: (pr: number | null) => void;
  commitSha: string | null;
  setCommitSha: (sha: string | null) => void;
  refresh: () => Promise<void>;
  loadFileDiff: (filePath: string) => Promise<FileDiff | null>;
  toggleViewed: (filePath: string, viewed: boolean) => Promise<void>;
  addComment: (
    filePath: string,
    lineNumber: number,
    text: string,
    lineContent?: string,
  ) => Promise<void>;
  resolveComment: (commentId: string) => Promise<void>;
  dismissNote: (noteId: string) => Promise<void>;
  stageFile: (filePath: string) => Promise<void>;
  unstageFile: (filePath: string) => Promise<void>;
  discardFile: (filePath: string) => Promise<void>;
  stageAllFiles: () => Promise<void>;
  commit: (message: string) => Promise<void>;
}

function getCacheKey(mode: DiffMode, compareBranch: string | null, prNumber: number | null, commitSha: string | null): string {
  if (mode === "pr") return `pr:${prNumber ?? "none"}`;
  if (mode === "commit") return `commit:${commitSha ?? "none"}`;
  return mode === "branch" ? `branch:${compareBranch ?? "default"}` : mode;
}

export function useDiff(repoId?: string | null): UseDiffResult {
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DiffMode>("working");
  const [branches, setBranches] = useState<string[]>([]);
  const [compareBranch, setCompareBranch] = useState<string | null>(null);
  const [prNumber, setPrNumber] = useState<number | null>(null);
  const [commitSha, setCommitSha] = useState<string | null>(null);

  const cacheRef = useRef<Map<string, CachedData>>(new Map());
  const hasLoadedOnceRef = useRef(false);

  const buildUrl = useCallback(
    (path: string, params: Record<string, string> = {}) => {
      const url = new URL(path, window.location.origin);
      if (repoId) {
        url.searchParams.set("repo", repoId);
      }
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
      return url.pathname + url.search;
    },
    [repoId],
  );

  useEffect(() => {
    if (!repoId) {
      setBranches([]);
      return;
    }
    fetch(buildUrl("/api/branches"))
      .then((res) => res.json())
      .then((data: { branches?: string[] }) => setBranches(data.branches ?? []))
      .catch(() => setBranches([]));
  }, [repoId, buildUrl]);

  const prevRepoIdRef = useRef(repoId);
  useEffect(() => {
    if (prevRepoIdRef.current !== repoId) {
      prevRepoIdRef.current = repoId;
      setCompareBranch(null);
      setPrNumber(null);
      setCommitSha(null);
      hasLoadedOnceRef.current = false;
      setInitialLoading(true);
    }
  }, [repoId]);

  const fetchData = useCallback(
    async (currentMode: DiffMode, currentCompareBranch: string | null, currentPrNumber: number | null, currentCommitSha: string | null, background = false) => {
      if (!repoId) {
        setLoading(false);
        setInitialLoading(false);
        setDiff(null);
        return;
      }

      if (currentMode === "pr" && !currentPrNumber) {
        setLoading(false);
        setInitialLoading(false);
        setDiff(null);
        return;
      }

      if (currentMode === "commit" && !currentCommitSha) {
        setLoading(false);
        setInitialLoading(false);
        setDiff(null);
        return;
      }

      const cacheKey = getCacheKey(currentMode, currentCompareBranch, currentPrNumber, currentCommitSha);

      if (!background) {
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          setDiff(cached.diff);
          setComments(cached.comments);
          setNotes(cached.notes);
          setLoading(false);
          setInitialLoading(false);
        } else {
          // Only show loading indicator, not full screen loader after first load
          setLoading(true);
        }
      }

      try {
        const diffParams: Record<string, string> = { mode: currentMode };
        if (currentMode === "pr" && currentPrNumber) {
          diffParams.pr = String(currentPrNumber);
        } else if (currentMode === "commit" && currentCommitSha) {
          diffParams.commit = currentCommitSha;
        } else if (currentCompareBranch) {
          diffParams.compare = currentCompareBranch;
        }
        const fetches: Promise<Response>[] = [
          fetch(buildUrl("/api/diff", diffParams)),
          fetch(buildUrl("/api/comments", { mode: currentMode })),
          fetch(buildUrl("/api/notes", { mode: currentMode })),
        ];

        const results = await Promise.all(fetches);
        const diffRes = results[0];
        const commentsRes = results[1];
        const notesRes = results[2];

        if (!diffRes?.ok) {
          throw new Error(diffRes ? await diffRes.text() : "Failed to fetch diff");
        }

        const diffData = (await diffRes.json()) as DiffResponse;
        const commentsData = commentsRes?.ok ? ((await commentsRes.json()) as Comment[]) : [];
        const notesData = notesRes?.ok ? ((await notesRes.json()) as Note[]) : [];

        setDiff((prevDiff) => {
          const mergedDiff = {
            ...diffData,
            files: diffData.files.map((newFile) => {
              const existingFile = prevDiff?.files.find((f) => f.path === newFile.path);
              if (existingFile) {
                return {
                  ...newFile,
                  patch: newFile.patch || existingFile.patch,
                  old_file: newFile.old_file ?? existingFile.old_file,
                  new_file: newFile.new_file ?? existingFile.new_file,
                };
              }
              return newFile;
            }),
          };

          cacheRef.current.set(cacheKey, {
            diff: mergedDiff,
            comments: commentsData,
            notes: notesData,
            timestamp: Date.now(),
          });

          return mergedDiff;
        });

        setComments(commentsData);
        setNotes(notesData);
        setError(null);
        hasLoadedOnceRef.current = true;
      } catch (err) {
        if (!cacheRef.current.has(cacheKey)) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        setLoading(false);
        setInitialLoading(false);
      }
    },
    [repoId, buildUrl],
  );

  useEffect(() => {
    cacheRef.current.clear();
  }, []);

  useEffect(() => {
    void fetchData(mode, compareBranch, prNumber, commitSha);
  }, [mode, compareBranch, prNumber, commitSha, fetchData]);

  useEffect(() => {
    if (!repoId) {
      return;
    }

    const interval = setInterval(() => {
      void fetchData(mode, compareBranch, prNumber, commitSha, true);
    }, 3000);
    return () => {
      clearInterval(interval);
    };
  }, [mode, compareBranch, prNumber, commitSha, repoId, fetchData]);

  const refresh = useCallback(
    () => fetchData(mode, compareBranch, prNumber, commitSha),
    [mode, compareBranch, prNumber, commitSha, fetchData],
  );

  const loadFileDiff = useCallback(
    async (filePath: string): Promise<FileDiff | null> => {
      try {
        const params: Record<string, string> = { mode, file: filePath };
        if (mode === "pr" && prNumber) {
          params.pr = String(prNumber);
        } else if (mode === "commit" && commitSha) {
          params.commit = commitSha;
        } else if (compareBranch) {
          params.compare = compareBranch;
        }
        const res = await fetch(buildUrl("/api/file-diff", params));
        if (!res.ok) {
          return null;
        }
        const fileDiff = (await res.json()) as FileDiff;

        setDiff((prev) =>
          prev
            ? {
                ...prev,
                files: prev.files.map((f) => (f.path === filePath ? { ...f, ...fileDiff } : f)),
              }
            : null,
        );

        return fileDiff;
      } catch {
        return null;
      }
    },
    [mode, buildUrl, compareBranch, prNumber, commitSha],
  );

  const toggleViewed = useCallback(
    async (filePath: string, currentlyViewed: boolean) => {
      const endpoint = currentlyViewed ? "/api/unmark-viewed" : "/api/mark-viewed";
      const res = await fetch(buildUrl(endpoint), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: filePath }),
      });
      if (!res.ok) {
        throw new Error("Failed to update");
      }
      setDiff((prev) =>
        prev
          ? {
              ...prev,
              files: prev.files.map((f) =>
                f.path === filePath ? { ...f, viewed: !currentlyViewed } : f,
              ),
            }
          : null,
      );
    },
    [buildUrl],
  );

  const addComment = useCallback(
    async (filePath: string, lineNumber: number, text: string, lineContent?: string) => {
      const commentText = lineContent ? `[context: \`${lineContent}\`]\n${text}` : text;
      const res = await fetch(buildUrl("/api/comments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: filePath, line_number: lineNumber, text: commentText }),
      });
      if (!res.ok) {
        throw new Error("Failed to add comment");
      }
      const newComment = (await res.json()) as Comment;
      setComments((prev) => [...prev, newComment]);
    },
    [buildUrl],
  );

  const resolveComment = useCallback(
    async (commentId: string) => {
      const res = await fetch(buildUrl("/api/comments/resolve"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment_id: commentId }),
      });
      if (!res.ok) {
        throw new Error("Failed to resolve");
      }
      setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, resolved: true } : c)));
    },
    [buildUrl],
  );

  const dismissNote = useCallback(
    async (noteId: string) => {
      const res = await fetch(buildUrl("/api/notes/dismiss"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note_id: noteId }),
      });
      if (!res.ok) {
        throw new Error("Failed to dismiss");
      }
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, dismissed: true } : n)));
    },
    [buildUrl],
  );

  const stageFile = useCallback(
    async (filePath: string) => {
      const res = await fetch(buildUrl("/api/stage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: filePath }),
      });
      if (!res.ok) {
        throw new Error("Failed to stage");
      }
      await fetchData(mode, compareBranch, prNumber, commitSha);
    },
    [mode, compareBranch, prNumber, commitSha, fetchData, buildUrl],
  );

  const unstageFile = useCallback(
    async (filePath: string) => {
      const res = await fetch(buildUrl("/api/unstage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: filePath }),
      });
      if (!res.ok) {
        throw new Error("Failed to unstage");
      }
      await fetchData(mode, compareBranch, prNumber, commitSha);
    },
    [mode, compareBranch, prNumber, commitSha, fetchData, buildUrl],
  );

  const discardFile = useCallback(
    async (filePath: string) => {
      const res = await fetch(buildUrl("/api/discard"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_path: filePath }),
      });
      if (!res.ok) {
        throw new Error("Failed to discard");
      }
      await fetchData(mode, compareBranch, prNumber, commitSha);
    },
    [mode, compareBranch, prNumber, commitSha, fetchData, buildUrl],
  );

  const stageAllFiles = useCallback(
    async () => {
      const res = await fetch(buildUrl("/api/stage-all"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        throw new Error("Failed to stage all");
      }
      await fetchData(mode, compareBranch, prNumber, commitSha);
    },
    [mode, compareBranch, prNumber, commitSha, fetchData, buildUrl],
  );

  const commit = useCallback(
    async (message: string) => {
      const res = await fetch(buildUrl("/api/commit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) {
        throw new Error("Failed to commit");
      }
      await fetchData(mode, compareBranch, prNumber, commitSha);
    },
    [mode, compareBranch, prNumber, commitSha, fetchData, buildUrl],
  );

  return {
    diff,
    comments,
    notes,
    loading,
    initialLoading,
    error,
    mode,
    setMode,
    branches,
    compareBranch,
    setCompareBranch,
    prNumber,
    setPrNumber,
    commitSha,
    setCommitSha,
    refresh,
    loadFileDiff,
    toggleViewed,
    addComment,
    resolveComment,
    dismissNote,
    stageFile,
    unstageFile,
    discardFile,
    stageAllFiles,
    commit,
  };
}
