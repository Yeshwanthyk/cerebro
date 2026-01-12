import { useCallback, useEffect, useState } from "react";
import type { Commit, CommitsResponse } from "../api/types";

interface UseCommitsResult {
  commits: Commit[];
  loading: boolean;
  error: string | null;
  selectedCommit: string | null;
  setSelectedCommit: (sha: string | null) => void;
  refresh: () => Promise<void>;
}

export function useCommits(repoId?: string | null): UseCommitsResult {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);

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
    [repoId]
  );

  const fetchCommits = useCallback(async () => {
    if (!repoId) {
      setCommits([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(buildUrl("/api/commits"));
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to fetch commits");
      }
      const data = (await res.json()) as CommitsResponse;
      setCommits(data.commits);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch commits");
      setCommits([]);
    } finally {
      setLoading(false);
    }
  }, [repoId, buildUrl]);

  useEffect(() => {
    void fetchCommits();
  }, [fetchCommits]);

  return {
    commits,
    loading,
    error,
    selectedCommit,
    setSelectedCommit,
    refresh: fetchCommits,
  };
}
