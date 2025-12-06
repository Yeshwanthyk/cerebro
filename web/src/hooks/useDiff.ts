import { useCallback, useEffect, useRef, useState } from "react";
import type { Comment, DiffResponse, FileDiff, Note } from "../api/types";

type DiffMode = "branch" | "working";

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
  error: string | null;
  mode: DiffMode;
  setMode: (mode: DiffMode) => void;
  branches: string[];
  compareBranch: string | null;
  setCompareBranch: (branch: string | null) => void;
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
  commit: (message: string) => Promise<void>;
}

// Cache key includes mode and branch for branch mode
function getCacheKey(mode: DiffMode, compareBranch: string | null): string {
  return mode === "branch" ? `branch:${compareBranch ?? "default"}` : mode;
}

export function useDiff(repoId?: string | null): UseDiffResult {
  const [diff, setDiff] = useState<DiffResponse | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<DiffMode>("branch");
  const [branches, setBranches] = useState<string[]>([]);
  const [compareBranch, setCompareBranch] = useState<string | null>(null);

  // Cache per mode/branch combination
  const cacheRef = useRef<Map<string, CachedData>>(new Map());

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

  // Fetch branches once when repo changes
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

  // Reset compareBranch when repo changes
  useEffect(() => {
    setCompareBranch(null);
  }, []);

  const fetchData = useCallback(
    async (currentMode: DiffMode, currentCompareBranch: string | null, background = false) => {
      if (!repoId) {
        setLoading(false);
        setDiff(null);
        return;
      }

      const cacheKey = getCacheKey(currentMode, currentCompareBranch);

      // Show cached data immediately if available (unless background refresh)
      if (!background) {
        const cached = cacheRef.current.get(cacheKey);
        if (cached) {
          setDiff(cached.diff);
          setComments(cached.comments);
          setNotes(cached.notes);
          setLoading(false);
        } else {
          setLoading(true);
        }
      }

      try {
        const diffParams: Record<string, string> = { mode: currentMode };
        if (currentCompareBranch) {
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

        // Update cache
        cacheRef.current.set(cacheKey, {
          diff: diffData,
          comments: commentsData,
          notes: notesData,
          timestamp: Date.now(),
        });

        // Only update state if this is still the current mode
        setDiff(diffData);
        setComments(commentsData);
        setNotes(notesData);
        setError(null);
      } catch (err) {
        // Only show error if no cached data
        if (!cacheRef.current.has(cacheKey)) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        setLoading(false);
      }
    },
    [repoId, buildUrl],
  );

  // Clear cache when repo changes
  useEffect(() => {
    cacheRef.current.clear();
  }, []);

  useEffect(() => {
    void fetchData(mode, compareBranch);
  }, [mode, compareBranch, fetchData]);

  // Background refresh every 3s to keep cache fresh
  useEffect(() => {
    if (!repoId) {
      return;
    }

    const interval = setInterval(() => {
      void fetchData(mode, compareBranch, true);
    }, 3000);
    return () => {
      clearInterval(interval);
    };
  }, [mode, compareBranch, repoId, fetchData]);

  const refresh = useCallback(
    () => fetchData(mode, compareBranch),
    [mode, compareBranch, fetchData],
  );

  const loadFileDiff = useCallback(
    async (filePath: string): Promise<FileDiff | null> => {
      try {
        const params: Record<string, string> = { mode, file: filePath };
        if (compareBranch) {
          params.compare = compareBranch;
        }
        const res = await fetch(buildUrl("/api/file-diff", params));
        if (!res.ok) {
          return null;
        }
        const fileDiff = (await res.json()) as FileDiff;

        // Update the file in the diff state with the full data
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
    [mode, buildUrl, compareBranch],
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
      await fetchData(mode, compareBranch);
    },
    [mode, compareBranch, fetchData, buildUrl],
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
      await fetchData(mode, compareBranch);
    },
    [mode, compareBranch, fetchData, buildUrl],
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
      await fetchData(mode, compareBranch);
    },
    [mode, compareBranch, fetchData, buildUrl],
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
      await fetchData(mode, compareBranch);
    },
    [mode, compareBranch, fetchData, buildUrl],
  );

  return {
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
    refresh,
    loadFileDiff,
    toggleViewed,
    addComment,
    resolveComment,
    dismissNote,
    stageFile,
    unstageFile,
    discardFile,
    commit,
  };
}
