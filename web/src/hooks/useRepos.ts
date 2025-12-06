import { useCallback, useEffect, useState } from "react";
import type { Repository, ReposResponse } from "../api/types";

interface UseReposResult {
  repos: Repository[];
  currentRepo: string | null;
  loading: boolean;
  error: string | null;
  setCurrentRepo: (id: string) => Promise<void>;
  addRepo: (path: string) => Promise<Repository>;
  removeRepo: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useRepos(): UseReposResult {
  const [repos, setRepos] = useState<Repository[]>([]);
  const [currentRepo, setCurrentRepoState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRepos = useCallback(async () => {
    try {
      const res = await fetch("/api/repos");
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as ReposResponse;
      setRepos(data.repos);
      setCurrentRepoState(data.currentRepo ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load repos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRepos();
  }, [fetchRepos]);

  const setCurrentRepo = useCallback(async (id: string) => {
    const res = await fetch("/api/repos/current", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      throw new Error("Failed to set current repo");
    }
    setCurrentRepoState(id);
  }, []);

  const addRepo = useCallback(
    async (path: string): Promise<Repository> => {
      const res = await fetch("/api/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to add repo");
      }
      const repo = (await res.json()) as Repository;
      await fetchRepos(); // Refresh list
      return repo;
    },
    [fetchRepos],
  );

  const removeRepo = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/repos/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        throw new Error("Failed to remove repo");
      }
      await fetchRepos(); // Refresh list
    },
    [fetchRepos],
  );

  return {
    repos,
    currentRepo,
    loading,
    error,
    setCurrentRepo,
    addRepo,
    removeRepo,
    refresh: fetchRepos,
  };
}
