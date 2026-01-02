import { useCallback, useEffect, useState } from "react";
import type { PullRequest, PRFilter, PRsResponse } from "../api/types";

interface UsePRsResult {
  prs: PullRequest[];
  loading: boolean;
  error: string | null;
  filter: PRFilter;
  setFilter: (filter: PRFilter) => void;
  selectedPR: number | null;
  setSelectedPR: (pr: number | null) => void;
  refresh: () => Promise<void>;
}

export function usePRs(repoId?: string | null): UsePRsResult {
  const [prs, setPRs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PRFilter>("all");
  const [selectedPR, setSelectedPR] = useState<number | null>(null);

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

  const fetchPRs = useCallback(async () => {
    if (!repoId) {
      setPRs([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(buildUrl("/api/prs", { filter }));
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to fetch PRs");
      }
      const data = (await res.json()) as PRsResponse;
      setPRs(data.prs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch PRs");
      setPRs([]);
    } finally {
      setLoading(false);
    }
  }, [repoId, filter, buildUrl]);

  useEffect(() => {
    void fetchPRs();
  }, [fetchPRs]);

  // Clear selection when filter changes
  const handleFilterChange = useCallback((newFilter: PRFilter) => {
    setFilter(newFilter);
    setSelectedPR(null);
  }, []);

  return {
    prs,
    loading,
    error,
    filter,
    setFilter: handleFilterChange,
    selectedPR,
    setSelectedPR,
    refresh: fetchPRs,
  };
}
