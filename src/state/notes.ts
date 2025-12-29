/**
 * Notes management
 */
import { isAbsolute, join, relative } from "path";
import type { Note } from "../types";
import { getDb, generateId } from "./db";
import { getRepo } from "./repos";

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
      .query(
        "SELECT * FROM notes WHERE repo_id = ? AND branch = ? AND dismissed = 0 ORDER BY created_at DESC"
      )
      .all(repoId, branch) as typeof rows;
  } else {
    rows = db
      .query("SELECT * FROM notes WHERE repo_id = ? ORDER BY created_at DESC")
      .all(repoId) as typeof rows;
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

export async function addNote(
  repoId: string,
  note: Omit<Note, "id" | "timestamp" | "dismissed">
): Promise<Note> {
  const db = getDb();
  const repo = await getRepo(repoId);

  if (!repo) {
    throw new Error(`Repository not found for id ${repoId}`);
  }

  const id = generateId();
  const createdAt = Date.now();
  const absolutePath = isAbsolute(note.file_path)
    ? note.file_path
    : join(repo.path, note.file_path);
  const normalizedPath = relative(repo.path, absolutePath);

  db.query(
    "INSERT INTO notes (id, repo_id, file_path, line_number, text, branch, commit_hash, author, type, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    repoId,
    normalizedPath,
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
    file_path: normalizedPath,
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

export async function dismissNote(
  noteId: string,
  dismissedBy: string = "user"
): Promise<boolean> {
  const db = getDb();

  const note = db.query("SELECT repo_id FROM notes WHERE id = ?").get(noteId) as {
    repo_id: string;
  } | null;
  if (!note) {
    return false;
  }

  const result = db
    .query(
      "UPDATE notes SET dismissed = 1, dismissed_by = ?, dismissed_at = ? WHERE id = ? AND repo_id = ?"
    )
    .run(dismissedBy, Date.now(), noteId, note.repo_id);

  return result.changes > 0;
}
