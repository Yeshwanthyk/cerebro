/**
 * Git commit operations
 */
import type { SimpleGit } from "simple-git";
import type { Commit, FileDiff } from "../types";
import { countChanges, getFileContents } from "./diff";

/**
 * List recent commits
 */
export async function listCommits(
  git: SimpleGit,
  limit: number = 50
): Promise<Commit[]> {
  // Format: hash|subject|author|email|date|numstat
  const log = await git.raw([
    "log",
    `-${limit}`,
    "--format=%H|%s|%an|%ae|%aI",
    "--shortstat",
  ]);

  const commits: Commit[] = [];
  const lines = log.trim().split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line || !line.includes("|")) {
      i++;
      continue;
    }

    const [sha, message, author, email, date] = line.split("|");
    if (!sha || !message || !author || !email || !date) {
      i++;
      continue;
    }

    // Next line might be empty, then stats
    i++;
    let additions = 0;
    let deletions = 0;
    let filesChanged = 0;

    // Skip empty lines and find stat line
    while (i < lines.length && lines[i]?.trim() === "") {
      i++;
    }

    const statLine = lines[i];
    if (statLine && !statLine.includes("|")) {
      // Parse: " 3 files changed, 10 insertions(+), 5 deletions(-)"
      const filesMatch = statLine.match(/(\d+) files? changed/);
      const addMatch = statLine.match(/(\d+) insertions?/);
      const delMatch = statLine.match(/(\d+) deletions?/);

      filesChanged = filesMatch?.[1] ? parseInt(filesMatch[1], 10) : 0;
      additions = addMatch?.[1] ? parseInt(addMatch[1], 10) : 0;
      deletions = delMatch?.[1] ? parseInt(delMatch[1], 10) : 0;
      i++;
    }

    commits.push({
      sha,
      shortSha: sha.slice(0, 7),
      message,
      author,
      email,
      date,
      additions,
      deletions,
      filesChanged,
    });
  }

  return commits;
}

/**
 * Get diff for a single commit (what changed in that commit)
 */
export async function getCommitDiff(
  git: SimpleGit,
  sha: string
): Promise<FileDiff[]> {
  // Get list of files changed with stats
  const nameStatus = await git.raw([
    "show",
    sha,
    "--format=",
    "--name-status",
  ]);

  const numstat = await git.raw([
    "show",
    sha,
    "--format=",
    "--numstat",
  ]);

  // Build stats map
  const statsMap = new Map<string, { additions: number; deletions: number }>();
  for (const line of numstat.trim().split("\n")) {
    if (!line.trim()) continue;
    const [add, del, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");
    if (filePath && add !== undefined && del !== undefined) {
      statsMap.set(filePath, {
        additions: add === "-" ? 0 : parseInt(add, 10),
        deletions: del === "-" ? 0 : parseInt(del, 10),
      });
    }
  }

  const files: FileDiff[] = [];

  for (const line of nameStatus.trim().split("\n")) {
    if (!line.trim()) continue;
    const [status, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");
    if (!filePath || !status) continue;

    let fileStatus: FileDiff["status"] = "modified";
    if (status.startsWith("A")) fileStatus = "added";
    else if (status.startsWith("D")) fileStatus = "deleted";
    else if (status.startsWith("R")) fileStatus = "renamed";

    const stats = statsMap.get(filePath) ?? { additions: 0, deletions: 0 };

    files.push({
      path: filePath,
      status: fileStatus,
      additions: stats.additions,
      deletions: stats.deletions,
      patch: "", // Loaded on demand
      viewed: false,
    });
  }

  return files;
}

/**
 * Get single file diff for a commit
 */
export async function getCommitFileDiff(
  git: SimpleGit,
  sha: string,
  filePath: string
): Promise<FileDiff | null> {
  try {
    // Get patch for this file
    const patch = await git.raw([
      "show",
      sha,
      "--format=",
      "--",
      filePath,
    ]);

    const { additions, deletions } = countChanges(patch);

    // Get name-status for this file
    const nameStatus = await git.raw([
      "show",
      sha,
      "--format=",
      "--name-status",
      "--",
      filePath,
    ]);

    let fileStatus: FileDiff["status"] = "modified";
    const statusLine = nameStatus.trim().split("\n")[0];
    if (statusLine?.startsWith("A")) fileStatus = "added";
    else if (statusLine?.startsWith("D")) fileStatus = "deleted";
    else if (statusLine?.startsWith("R")) fileStatus = "renamed";

    // Get file contents from commit and parent
    const parentSha = `${sha}^`;
    const oldFile = fileStatus !== "added"
      ? await getFileContents(git, parentSha, filePath)
      : undefined;
    const newFile = fileStatus !== "deleted"
      ? await getFileContents(git, sha, filePath)
      : undefined;

    return {
      path: filePath,
      status: fileStatus,
      additions,
      deletions,
      patch,
      viewed: false,
      old_file: oldFile,
      new_file: newFile,
    };
  } catch {
    return null;
  }
}

/**
 * Get commit metadata
 */
export async function getCommitInfo(
  git: SimpleGit,
  sha: string
): Promise<{ message: string; author: string; date: string } | null> {
  try {
    const info = await git.raw([
      "show",
      sha,
      "--format=%s|%an|%aI",
      "--no-patch",
    ]);
    const [message, author, date] = info.trim().split("|");
    if (!message || !author || !date) return null;
    return { message, author, date };
  } catch {
    return null;
  }
}
