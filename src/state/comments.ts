/**
 * Comments management
 */
import { isAbsolute, join, relative } from "path";
import type { Comment } from "../types";
import { getDb, generateId } from "./db";
import { getRepo } from "./repos";

export async function getComments(repoId: string, branch?: string): Promise<Comment[]> {
  const db = getDb();

  let rows: Array<{
    id: string;
    repo_id: string;
    file_path: string;
    line_number: number | null;
    text: string;
    parent_id: string | null;
    branch: string;
    commit_hash: string;
    created_at: number;
    resolved: number;
    resolved_by: string | null;
    resolved_at: number | null;
  }>;

  if (branch) {
    rows = db
      .query(
        "SELECT * FROM comments WHERE repo_id = ? AND branch = ? AND resolved = 0 ORDER BY created_at DESC"
      )
      .all(repoId, branch) as typeof rows;
  } else {
    rows = db
      .query("SELECT * FROM comments WHERE repo_id = ? ORDER BY created_at DESC")
      .all(repoId) as typeof rows;
  }

  return rows.map((r) => ({
    id: r.id,
    file_path: r.file_path,
    line_number: r.line_number ?? undefined,
    text: r.text,
    parent_id: r.parent_id ?? undefined,
    timestamp: r.created_at,
    branch: r.branch,
    commit: r.commit_hash,
    resolved: r.resolved === 1,
    resolved_by: r.resolved_by ?? undefined,
    resolved_at: r.resolved_at ?? undefined,
  }));
}

export async function getCommentById(
  commentId: string
): Promise<(Comment & { repo_id: string }) | null> {
  const db = getDb();

  const row = db
    .query(
      "SELECT id, repo_id, file_path, line_number, text, parent_id, branch, commit_hash, created_at, resolved, resolved_by, resolved_at FROM comments WHERE id = ?"
    )
    .get(commentId) as
    | {
        id: string;
        repo_id: string;
        file_path: string;
        line_number: number | null;
        text: string;
        parent_id: string | null;
        branch: string;
        commit_hash: string;
        created_at: number;
        resolved: number;
        resolved_by: string | null;
        resolved_at: number | null;
      }
    | undefined;

  if (!row) return null;

  return {
    id: row.id,
    repo_id: row.repo_id,
    file_path: row.file_path,
    line_number: row.line_number ?? undefined,
    text: row.text,
    parent_id: row.parent_id ?? undefined,
    timestamp: row.created_at,
    branch: row.branch,
    commit: row.commit_hash,
    resolved: row.resolved === 1,
    resolved_by: row.resolved_by ?? undefined,
    resolved_at: row.resolved_at ?? undefined,
  };
}

export async function addComment(
  repoId: string,
  comment: Omit<Comment, "id" | "timestamp" | "resolved">
): Promise<Comment> {
  const db = getDb();
  const repo = await getRepo(repoId);

  if (!repo) {
    throw new Error(`Repository not found for id ${repoId}`);
  }

  const id = generateId();
  const createdAt = Date.now();
  const absolutePath = isAbsolute(comment.file_path)
    ? comment.file_path
    : join(repo.path, comment.file_path);
  const normalizedPath = relative(repo.path, absolutePath);

  db.query(
    "INSERT INTO comments (id, repo_id, file_path, line_number, text, branch, commit_hash, created_at, parent_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    repoId,
    normalizedPath,
    comment.line_number ?? null,
    comment.text,
    comment.branch,
    comment.commit,
    createdAt,
    comment.parent_id ?? null
  );

  return {
    id,
    file_path: normalizedPath,
    line_number: comment.line_number,
    text: comment.text,
    parent_id: comment.parent_id,
    timestamp: createdAt,
    branch: comment.branch,
    commit: comment.commit,
    resolved: false,
  };
}

export async function resolveComment(
  commentId: string,
  resolvedBy: string = "user"
): Promise<boolean> {
  const db = getDb();

  const existing = db.query("SELECT repo_id FROM comments WHERE id = ?").get(commentId) as {
    repo_id: string;
  } | null;
  if (!existing) {
    return false;
  }

  const result = db
    .query(
      "UPDATE comments SET resolved = 1, resolved_by = ?, resolved_at = ? WHERE id = ? AND repo_id = ?"
    )
    .run(resolvedBy, Date.now(), commentId, existing.repo_id);

  return result.changes > 0;
}
