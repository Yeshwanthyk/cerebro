/**
 * Repository management
 */
import type { ReposState, Repository } from "../types";
import { getDb, generateId } from "./db";

export async function getReposState(): Promise<ReposState> {
  const db = getDb();
  const repos = db.query("SELECT * FROM repos ORDER BY added_at DESC").all() as Array<{
    id: string;
    path: string;
    name: string;
    base_branch: string;
    added_at: number;
  }>;

  const currentRepoRow = db.query("SELECT value FROM config WHERE key = 'currentRepo'").get() as {
    value: string;
  } | null;

  return {
    repos: repos.map((r) => ({
      id: r.id,
      path: r.path,
      name: r.name,
      baseBranch: r.base_branch,
      addedAt: r.added_at,
    })),
    currentRepo: currentRepoRow?.value,
  };
}

export async function getRepos(): Promise<Repository[]> {
  const state = await getReposState();
  return state.repos;
}

export async function getRepo(id: string): Promise<Repository | undefined> {
  const db = getDb();
  const row = db.query("SELECT * FROM repos WHERE id = ?").get(id) as {
    id: string;
    path: string;
    name: string;
    base_branch: string;
    added_at: number;
  } | null;

  if (!row) return undefined;

  return {
    id: row.id,
    path: row.path,
    name: row.name,
    baseBranch: row.base_branch,
    addedAt: row.added_at,
  };
}

export async function getRepoByPath(path: string): Promise<Repository | undefined> {
  const db = getDb();
  const row = db.query("SELECT * FROM repos WHERE path = ?").get(path) as {
    id: string;
    path: string;
    name: string;
    base_branch: string;
    added_at: number;
  } | null;

  if (!row) return undefined;

  return {
    id: row.id,
    path: row.path,
    name: row.name,
    baseBranch: row.base_branch,
    addedAt: row.added_at,
  };
}

export async function addRepo(
  path: string,
  name: string,
  baseBranch: string = "main"
): Promise<Repository> {
  const db = getDb();

  // Check if already exists
  const existing = await getRepoByPath(path);
  if (existing) {
    return existing;
  }

  const id = generateId();
  const addedAt = Date.now();

  db.query(
    "INSERT INTO repos (id, path, name, base_branch, added_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, path, name, baseBranch, addedAt);

  // Set as current if it's the first repo
  const currentRepo = db.query("SELECT value FROM config WHERE key = 'currentRepo'").get() as {
    value: string;
  } | null;
  if (!currentRepo) {
    db.query("INSERT OR REPLACE INTO config (key, value) VALUES ('currentRepo', ?)").run(id);
  }

  return { id, path, name, baseBranch, addedAt };
}

export async function removeRepo(id: string): Promise<boolean> {
  const db = getDb();

  const repo = await getRepo(id);
  if (!repo) {
    return false;
  }

  // Delete repo (cascades to viewed_files, comments, notes)
  db.query("DELETE FROM repos WHERE id = ?").run(id);

  // Update current repo if needed
  const currentRepo = db.query("SELECT value FROM config WHERE key = 'currentRepo'").get() as {
    value: string;
  } | null;
  if (currentRepo?.value === id) {
    const firstRepo = db.query("SELECT id FROM repos ORDER BY added_at DESC LIMIT 1").get() as {
      id: string;
    } | null;
    if (firstRepo) {
      db.query("UPDATE config SET value = ? WHERE key = 'currentRepo'").run(firstRepo.id);
    } else {
      db.query("DELETE FROM config WHERE key = 'currentRepo'").run();
    }
  }

  return true;
}

export async function setCurrentRepo(id: string | null): Promise<boolean> {
  const db = getDb();

  if (id === null) {
    db.query("DELETE FROM config WHERE key = 'currentRepo'").run();
    return true;
  }

  const repo = await getRepo(id);
  if (!repo) {
    return false;
  }

  db.query("INSERT OR REPLACE INTO config (key, value) VALUES ('currentRepo', ?)").run(id);
  return true;
}

export async function getCurrentRepo(): Promise<Repository | undefined> {
  const db = getDb();

  const currentRepoRow = db.query("SELECT value FROM config WHERE key = 'currentRepo'").get() as {
    value: string;
  } | null;
  if (currentRepoRow?.value) {
    return getRepo(currentRepoRow.value);
  }

  // Return first repo if no current set
  const firstRepo = db.query("SELECT id FROM repos ORDER BY added_at DESC LIMIT 1").get() as {
    id: string;
  } | null;
  if (firstRepo) {
    return getRepo(firstRepo.id);
  }

  return undefined;
}

export async function updateRepo(
  id: string,
  updates: Partial<Pick<Repository, "baseBranch" | "name">>
): Promise<boolean> {
  const db = getDb();

  const repo = await getRepo(id);
  if (!repo) {
    return false;
  }

  if (updates.baseBranch !== undefined) {
    db.query("UPDATE repos SET base_branch = ? WHERE id = ?").run(updates.baseBranch, id);
  }
  if (updates.name !== undefined) {
    db.query("UPDATE repos SET name = ? WHERE id = ?").run(updates.name, id);
  }

  return true;
}
