/**
 * State management using SQLite
 * Stores repos, viewed files, comments, and notes
 */
import { homedir } from "os";
import { join } from "path";
import type { Comment, Config, Note, ReposState, Repository } from "../types";
import { getDb, generateId, closeDb } from "./db";

// Config file path (keep as JSON for simple settings)
const CONFIG_DIR = join(homedir(), ".config", "cerebro");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

// Re-export closeDb for cleanup
export { closeDb };

// ============================================================================
// Global Config (kept as JSON for simplicity)
// ============================================================================

export async function getConfig(): Promise<Config> {
  const file = Bun.file(CONFIG_FILE);
  if (await file.exists()) {
    try {
      const cfg = await file.json();
      return {
        defaultPort: cfg.defaultPort ?? 3030,
        currentRepo: cfg.currentRepo,
        githubToken: cfg.githubToken,
      } satisfies Config;
    } catch {
      // Corrupted file, return defaults
    }
  }
  return { defaultPort: 3030 };
}

export async function saveConfig(config: Config): Promise<void> {
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ============================================================================
// Repository Management
// ============================================================================

export async function getReposState(): Promise<ReposState> {
  const db = getDb();
  const repos = db.query("SELECT * FROM repos ORDER BY added_at DESC").all() as Array<{
    id: string;
    path: string;
    name: string;
    base_branch: string;
    added_at: number;
  }>;

  const currentRepoRow = db.query("SELECT value FROM config WHERE key = 'currentRepo'").get() as { value: string } | null;

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

export async function addRepo(path: string, name: string, baseBranch: string = "main"): Promise<Repository> {
  const db = getDb();

  // Check if already exists
  const existing = await getRepoByPath(path);
  if (existing) {
    return existing;
  }

  const id = generateId();
  const addedAt = Date.now();

  db.query("INSERT INTO repos (id, path, name, base_branch, added_at) VALUES (?, ?, ?, ?, ?)").run(
    id,
    path,
    name,
    baseBranch,
    addedAt
  );

  // Set as current if it's the first repo
  const currentRepo = db.query("SELECT value FROM config WHERE key = 'currentRepo'").get() as { value: string } | null;
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
  const currentRepo = db.query("SELECT value FROM config WHERE key = 'currentRepo'").get() as { value: string } | null;
  if (currentRepo?.value === id) {
    const firstRepo = db.query("SELECT id FROM repos ORDER BY added_at DESC LIMIT 1").get() as { id: string } | null;
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

  const currentRepoRow = db.query("SELECT value FROM config WHERE key = 'currentRepo'").get() as { value: string } | null;
  if (currentRepoRow?.value) {
    return getRepo(currentRepoRow.value);
  }

  // Return first repo if no current set
  const firstRepo = db.query("SELECT id FROM repos ORDER BY added_at DESC LIMIT 1").get() as { id: string } | null;
  if (firstRepo) {
    return getRepo(firstRepo.id);
  }

  return undefined;
}

export async function updateRepo(id: string, updates: Partial<Pick<Repository, "baseBranch" | "name">>): Promise<boolean> {
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

// ============================================================================
// Viewed Files
// ============================================================================

export async function getViewedFiles(repoId: string, branch: string, commit: string): Promise<Record<string, boolean>> {
  const db = getDb();

  const rows = db
    .query("SELECT file_path FROM viewed_files WHERE repo_id = ? AND branch = ? AND commit_hash = ?")
    .all(repoId, branch, commit) as Array<{ file_path: string }>;

  const result: Record<string, boolean> = {};
  for (const row of rows) {
    result[row.file_path] = true;
  }
  return result;
}

export async function setFileViewed(
  repoId: string,
  branch: string,
  commit: string,
  filePath: string,
  viewed: boolean
): Promise<void> {
  const db = getDb();

  if (viewed) {
    db.query(
      "INSERT OR REPLACE INTO viewed_files (repo_id, branch, commit_hash, file_path, viewed_at) VALUES (?, ?, ?, ?, ?)"
    ).run(repoId, branch, commit, filePath, Date.now());
  } else {
    db.query("DELETE FROM viewed_files WHERE repo_id = ? AND branch = ? AND commit_hash = ? AND file_path = ?").run(
      repoId,
      branch,
      commit,
      filePath
    );
  }
}

// ============================================================================
// Comments
// ============================================================================

export async function getComments(repoId: string, branch?: string): Promise<Comment[]> {
  const db = getDb();

  let rows: Array<{
    id: string;
    repo_id: string;
    file_path: string;
    line_number: number | null;
    text: string;
    branch: string;
    commit_hash: string;
    created_at: number;
    resolved: number;
    resolved_by: string | null;
    resolved_at: number | null;
  }>;

  if (branch) {
    rows = db
      .query("SELECT * FROM comments WHERE repo_id = ? AND branch = ? AND resolved = 0 ORDER BY created_at DESC")
      .all(repoId, branch) as typeof rows;
  } else {
    rows = db.query("SELECT * FROM comments WHERE repo_id = ? ORDER BY created_at DESC").all(repoId) as typeof rows;
  }

  return rows.map((r) => ({
    id: r.id,
    file_path: r.file_path,
    line_number: r.line_number ?? undefined,
    text: r.text,
    timestamp: r.created_at,
    branch: r.branch,
    commit: r.commit_hash,
    resolved: r.resolved === 1,
    resolved_by: r.resolved_by ?? undefined,
    resolved_at: r.resolved_at ?? undefined,
  }));
}

export async function addComment(repoId: string, comment: Omit<Comment, "id" | "timestamp" | "resolved">): Promise<Comment> {
  const db = getDb();

  const id = generateId();
  const createdAt = Date.now();

  db.query(
    "INSERT INTO comments (id, repo_id, file_path, line_number, text, branch, commit_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, repoId, comment.file_path, comment.line_number ?? null, comment.text, comment.branch, comment.commit, createdAt);

  return {
    id,
    file_path: comment.file_path,
    line_number: comment.line_number,
    text: comment.text,
    timestamp: createdAt,
    branch: comment.branch,
    commit: comment.commit,
    resolved: false,
  };
}

export async function resolveComment(repoId: string, commentId: string, resolvedBy: string = "user"): Promise<boolean> {
  const db = getDb();

  const result = db
    .query("UPDATE comments SET resolved = 1, resolved_by = ?, resolved_at = ? WHERE id = ? AND repo_id = ?")
    .run(resolvedBy, Date.now(), commentId, repoId);

  return result.changes > 0;
}

// ============================================================================
// Notes
// ============================================================================

export async function getNotes(repoId: string, branch?: string): Promise<Note[]> {
  const db = getDb();

  let rows: Array<{
    id: string;
    repo_id: string;
    file_path: string;
    line_number: number;
    text: string;
    branch: string;
    commit_hash: string;
    author: string;
    type: string;
    metadata: string | null;
    created_at: number;
    dismissed: number;
    dismissed_by: string | null;
    dismissed_at: number | null;
  }>;

  if (branch) {
    rows = db
      .query("SELECT * FROM notes WHERE repo_id = ? AND branch = ? AND dismissed = 0 ORDER BY created_at DESC")
      .all(repoId, branch) as typeof rows;
  } else {
    rows = db.query("SELECT * FROM notes WHERE repo_id = ? ORDER BY created_at DESC").all(repoId) as typeof rows;
  }

  return rows.map((r) => ({
    id: r.id,
    file_path: r.file_path,
    line_number: r.line_number,
    text: r.text,
    timestamp: r.created_at,
    branch: r.branch,
    commit: r.commit_hash,
    author: r.author,
    type: r.type as "explanation" | "rationale" | "suggestion",
    metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    dismissed: r.dismissed === 1,
    dismissed_by: r.dismissed_by ?? undefined,
    dismissed_at: r.dismissed_at ?? undefined,
  }));
}

export async function addNote(repoId: string, note: Omit<Note, "id" | "timestamp" | "dismissed">): Promise<Note> {
  const db = getDb();

  const id = generateId();
  const createdAt = Date.now();

  db.query(
    "INSERT INTO notes (id, repo_id, file_path, line_number, text, branch, commit_hash, author, type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    repoId,
    note.file_path,
    note.line_number,
    note.text,
    note.branch,
    note.commit,
    note.author,
    note.type,
    note.metadata ? JSON.stringify(note.metadata) : null,
    createdAt
  );

  return {
    id,
    file_path: note.file_path,
    line_number: note.line_number,
    text: note.text,
    timestamp: createdAt,
    branch: note.branch,
    commit: note.commit,
    author: note.author,
    type: note.type,
    metadata: note.metadata,
    dismissed: false,
  };
}

export async function dismissNote(repoId: string, noteId: string, dismissedBy: string = "user"): Promise<boolean> {
  const db = getDb();

  const result = db
    .query("UPDATE notes SET dismissed = 1, dismissed_by = ?, dismissed_at = ? WHERE id = ? AND repo_id = ?")
    .run(dismissedBy, Date.now(), noteId, repoId);

  return result.changes > 0;
}
