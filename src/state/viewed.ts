/**
 * Viewed files state management
 */
import { getDb } from "./db";

export async function getViewedFiles(
  repoId: string,
  branch: string,
  commit: string
): Promise<Record<string, boolean>> {
  const db = getDb();

  const rows = db
    .query(
      "SELECT file_path FROM viewed_files WHERE repo_id = ? AND branch = ? AND commit_hash = ?"
    )
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
    db.query(
      "DELETE FROM viewed_files WHERE repo_id = ? AND branch = ? AND commit_hash = ? AND file_path = ?"
    ).run(repoId, branch, commit, filePath);
  }
}
