/**
 * Git diff operations
 */
import type { SimpleGit } from "simple-git";
import { basename, join } from "path";
import type { FileDiff, FileContents } from "../types";

export const UNIFIED_CONTEXT = 3;
export const UNIFIED_ARG = `--unified=${UNIFIED_CONTEXT}`;

export function withUnifiedContext(args: string[]): string[] {
  return [UNIFIED_ARG, ...args];
}

/**
 * Count additions and deletions from a patch
 */
export function countChanges(patch: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  const lines = patch.split("\n");
  for (const line of lines) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++;
    }
  }

  return { additions, deletions };
}

/**
 * Get file contents from a git ref
 */
export async function getFileContents(
  git: SimpleGit,
  ref: string,
  filePath: string
): Promise<FileContents | undefined> {
  try {
    const contents = await git.show([`${ref}:${filePath}`]);
    return {
      name: basename(filePath),
      contents,
    };
  } catch {
    return undefined;
  }
}

/**
 * Get file contents from working directory
 */
export async function getWorkingFileContents(
  repoPath: string,
  filePath: string
): Promise<FileContents | undefined> {
  try {
    const fullPath = join(repoPath, filePath);
    const file = Bun.file(fullPath);
    if (await file.exists()) {
      const contents = await file.text();
      return {
        name: basename(filePath),
        contents,
      };
    }
  } catch {
    // File doesn't exist or can't be read
  }
  return undefined;
}

/**
 * Get staged file contents from index
 */
export async function getStagedFileContents(
  git: SimpleGit,
  filePath: string
): Promise<FileContents | undefined> {
  try {
    const contents = await git.show([`:${filePath}`]);
    return {
      name: basename(filePath),
      contents,
    };
  } catch {
    return undefined;
  }
}

/**
 * Create a patch for a new file
 */
export function createAddPatch(filePath: string, contents: string): string {
  const lines = contents.split("\n");
  const patchLines = lines.map((line) => `+${line}`);
  return `diff --git a/${filePath} b/${filePath}
new file mode 100644
--- /dev/null
+++ b/${filePath}
@@ -0,0 +1,${lines.length} @@
${patchLines.join("\n")}`;
}

/**
 * Create a patch for a deleted file
 */
export function createDeletePatch(filePath: string, contents: string): string {
  const lines = contents.split("\n");
  const patchLines = lines.map((line) => `-${line}`);
  return `diff --git a/${filePath} b/${filePath}
deleted file mode 100644
--- a/${filePath}
+++ /dev/null
@@ -1,${lines.length} +0,0 @@
${patchLines.join("\n")}`;
}

/**
 * Get all working directory changes (both staged and unstaged)
 */
export async function getWorkingDiff(git: SimpleGit, repoPath: string): Promise<FileDiff[]> {
  const status = await git.status();
  const files: FileDiff[] = [];
  const processedPaths = new Set<string>();

  // Staged files first
  const stagedDiff = await git.diff(["--cached", "--name-status"]);
  if (stagedDiff.trim()) {
    for (const line of stagedDiff.trim().split("\n")) {
      const [statusCode, ...pathParts] = line.split("\t");
      const filePath = pathParts.join("\t");
      if (!filePath || !statusCode) continue;

      processedPaths.add(filePath);
      const patchDiff = await git.diff(withUnifiedContext(["--cached", "--", filePath]));
      const { additions, deletions } = countChanges(patchDiff);

      let fileStatus: FileDiff["status"] = "modified";
      if (statusCode.startsWith("A")) fileStatus = "added";
      else if (statusCode.startsWith("D")) fileStatus = "deleted";
      else if (statusCode.startsWith("R")) fileStatus = "renamed";

      files.push({
        path: filePath,
        status: fileStatus,
        additions,
        deletions,
        patch: patchDiff,
        viewed: false,
        staged: true,
        old_file: fileStatus !== "added" ? await getFileContents(git, "HEAD", filePath) : undefined,
        new_file: fileStatus !== "deleted" ? await getStagedFileContents(git, filePath) : undefined,
      });
    }
  }

  // Unstaged modified files
  for (const filePath of status.modified) {
    if (processedPaths.has(filePath)) continue;
    processedPaths.add(filePath);

    const diff = await git.diff(withUnifiedContext(["--", filePath]));
    const { additions, deletions } = countChanges(diff);

    files.push({
      path: filePath,
      status: "modified",
      additions,
      deletions,
      patch: diff,
      viewed: false,
      staged: false,
      old_file: await getFileContents(git, "HEAD", filePath),
      new_file: await getWorkingFileContents(repoPath, filePath),
    });
  }

  // Untracked files
  for (const filePath of status.not_added) {
    if (processedPaths.has(filePath)) continue;
    processedPaths.add(filePath);

    const contents = await getWorkingFileContents(repoPath, filePath);
    const lines = contents?.contents.split("\n").length || 0;

    files.push({
      path: filePath,
      status: "untracked",
      additions: lines,
      deletions: 0,
      patch: createAddPatch(filePath, contents?.contents || ""),
      viewed: false,
      staged: false,
      new_file: contents,
    });
  }

  // Unstaged deleted files
  for (const filePath of status.deleted) {
    if (processedPaths.has(filePath)) continue;
    processedPaths.add(filePath);

    const oldContents = await getFileContents(git, "HEAD", filePath);
    const lines = oldContents?.contents.split("\n").length || 0;

    files.push({
      path: filePath,
      status: "deleted",
      additions: 0,
      deletions: lines,
      patch: createDeletePatch(filePath, oldContents?.contents || ""),
      viewed: false,
      staged: false,
      old_file: oldContents,
    });
  }

  return files;
}

/**
 * Get branch diff against base - returns file list with stats only (lazy loading)
 */
export async function getBranchDiff(
  git: SimpleGit,
  _repoPath: string,
  baseBranch: string
): Promise<FileDiff[]> {
  // Find merge base
  let mergeBase: string;
  try {
    mergeBase = (await git.raw(["merge-base", baseBranch, "HEAD"])).trim();
  } catch {
    // Base branch might not exist, use it directly
    mergeBase = baseBranch;
  }

  // Get numstat for additions/deletions counts (single git call)
  const numstat = await git.diff([mergeBase, "HEAD", "--numstat"]);
  const statsMap = new Map<string, { additions: number; deletions: number }>();

  if (numstat.trim()) {
    for (const line of numstat.trim().split("\n")) {
      const [add, del, ...pathParts] = line.split("\t");
      const filePath = pathParts.join("\t");
      if (filePath && add !== undefined && del !== undefined) {
        statsMap.set(filePath, {
          additions: add === "-" ? 0 : parseInt(add, 10),
          deletions: del === "-" ? 0 : parseInt(del, 10),
        });
      }
    }
  }

  // Get name-status for file statuses (single git call)
  const nameStatus = await git.diff([mergeBase, "HEAD", "--name-status"]);
  const files: FileDiff[] = [];

  if (!nameStatus.trim()) {
    return files;
  }

  const lines = nameStatus.trim().split("\n");
  for (const line of lines) {
    const [status, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");

    if (!filePath || !status) continue;

    let fileStatus: FileDiff["status"] = "modified";
    if (status.startsWith("A")) fileStatus = "added";
    else if (status.startsWith("D")) fileStatus = "deleted";
    else if (status.startsWith("R")) fileStatus = "renamed";

    const stats = statsMap.get(filePath) || { additions: 0, deletions: 0 };

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
 * Get single file diff for branch mode
 */
export async function getSingleBranchFileDiff(
  git: SimpleGit,
  baseBranch: string,
  filePath: string
): Promise<FileDiff | null> {
  let mergeBase: string;
  try {
    mergeBase = (await git.raw(["merge-base", baseBranch, "HEAD"])).trim();
  } catch {
    mergeBase = baseBranch;
  }

  try {
    const patchDiff = await git.diff(withUnifiedContext([mergeBase, "HEAD", "--", filePath]));
    const { additions, deletions } = countChanges(patchDiff);

    const nameStatus = await git.diff([mergeBase, "HEAD", "--name-status", "--", filePath]);
    let fileStatus: FileDiff["status"] = "modified";
    if (nameStatus.startsWith("A")) fileStatus = "added";
    else if (nameStatus.startsWith("D")) fileStatus = "deleted";
    else if (nameStatus.startsWith("R")) fileStatus = "renamed";

    return {
      path: filePath,
      status: fileStatus,
      additions,
      deletions,
      patch: patchDiff,
      viewed: false,
      old_file: fileStatus !== "added" ? await getFileContents(git, mergeBase, filePath) : undefined,
      new_file: fileStatus !== "deleted" ? await getFileContents(git, "HEAD", filePath) : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Get single file diff for working directory mode
 */
export async function getSingleWorkingFileDiff(
  git: SimpleGit,
  repoPath: string,
  filePath: string
): Promise<FileDiff | null> {
  // Check if file is staged first
  const stagedDiff = await git.diff(["--cached", "--name-status", "--", filePath]);
  if (stagedDiff.trim()) {
    const [statusCode] = stagedDiff.trim().split("\t");
    const patchDiff = await git.diff(withUnifiedContext(["--cached", "--", filePath]));
    const { additions, deletions } = countChanges(patchDiff);

    let fileStatus: FileDiff["status"] = "modified";
    if (statusCode?.startsWith("A")) fileStatus = "added";
    else if (statusCode?.startsWith("D")) fileStatus = "deleted";
    else if (statusCode?.startsWith("R")) fileStatus = "renamed";

    return {
      path: filePath,
      status: fileStatus,
      additions,
      deletions,
      patch: patchDiff,
      viewed: false,
      staged: true,
      old_file: fileStatus !== "added" ? await getFileContents(git, "HEAD", filePath) : undefined,
      new_file: fileStatus !== "deleted" ? await getStagedFileContents(git, filePath) : undefined,
    };
  }

  const status = await git.status();

  // Check if modified (unstaged)
  if (status.modified.includes(filePath)) {
    const diff = await git.diff(withUnifiedContext(["--", filePath]));
    const { additions, deletions } = countChanges(diff);
    return {
      path: filePath,
      status: "modified",
      additions,
      deletions,
      patch: diff,
      viewed: false,
      staged: false,
      old_file: await getFileContents(git, "HEAD", filePath),
      new_file: await getWorkingFileContents(repoPath, filePath),
    };
  }

  // Check if untracked
  if (status.not_added.includes(filePath)) {
    const contents = await getWorkingFileContents(repoPath, filePath);
    const lines = contents?.contents.split("\n").length || 0;
    return {
      path: filePath,
      status: "untracked",
      additions: lines,
      deletions: 0,
      patch: createAddPatch(filePath, contents?.contents || ""),
      viewed: false,
      staged: false,
      new_file: contents,
    };
  }

  // Check if deleted (unstaged)
  if (status.deleted.includes(filePath)) {
    const oldContents = await getFileContents(git, "HEAD", filePath);
    const lines = oldContents?.contents.split("\n").length || 0;
    return {
      path: filePath,
      status: "deleted",
      additions: 0,
      deletions: lines,
      patch: createDeletePatch(filePath, oldContents?.contents || ""),
      viewed: false,
      staged: false,
      old_file: oldContents,
    };
  }

  return null;
}
