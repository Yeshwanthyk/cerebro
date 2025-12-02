import simpleGit, { type SimpleGit, type StatusResult } from "simple-git";
import { basename, join } from "path";
import type { DiffMode, DiffResponse, FileDiff, FileContents } from "../types";

export interface GitManager {
  repoPath: string;
  git: SimpleGit;
  getDiff(options: { baseBranch: string; mode: DiffMode }): Promise<DiffResponse>;
  getFileDiff(options: { baseBranch: string; mode: DiffMode; filePath: string }): Promise<FileDiff | null>;
  getCurrentBranch(): Promise<string>;
  getCurrentCommit(): Promise<string>;
  getDefaultBranch(): Promise<string>;
  getRemoteUrl(): Promise<string | undefined>;
  stageFile(filePath: string): Promise<void>;
  unstageFile(filePath: string): Promise<void>;
  discardFile(filePath: string): Promise<void>;
  commit(message: string): Promise<string>;
  status(): Promise<StatusResult>;
}

// Cache of git managers by repo path
const managers = new Map<string, GitManager>();

export function getGitManager(repoPath: string): GitManager {
  const cached = managers.get(repoPath);
  if (cached) {
    return cached;
  }

  const git = simpleGit(repoPath);
  const manager = createGitManager(repoPath, git);
  managers.set(repoPath, manager);
  return manager;
}

function createGitManager(repoPath: string, git: SimpleGit): GitManager {
  return {
    repoPath,
    git,

    async getCurrentBranch(): Promise<string> {
      const result = await git.branch();
      return result.current;
    },

    async getCurrentCommit(): Promise<string> {
      const result = await git.revparse(["HEAD"]);
      return result.trim().slice(0, 7);
    },

    async getDefaultBranch(): Promise<string> {
      // Try to detect from remote
      try {
        const remote = await git.remote(["show", "origin"]);
        if (remote) {
          const match = remote.match(/HEAD branch:\s*(\S+)/);
          if (match) {
            return match[1];
          }
        }
      } catch {
        // Remote not available
      }

      // Check common branch names
      const branches = await git.branchLocal();
      const commonNames = ["main", "master", "develop", "dev"];
      for (const name of commonNames) {
        if (branches.all.includes(name)) {
          return name;
        }
      }

      // Fall back to current branch
      return branches.current || "main";
    },

    async getRemoteUrl(): Promise<string | undefined> {
      try {
        const remotes = await git.getRemotes(true);
        const origin = remotes.find((r) => r.name === "origin");
        return origin?.refs?.fetch;
      } catch {
        return undefined;
      }
    },

    async getDiff(options: { baseBranch: string; mode: DiffMode }): Promise<DiffResponse> {
      const { baseBranch, mode } = options;
      const branch = await this.getCurrentBranch();
      const commit = await this.getCurrentCommit();
      const remoteUrl = await this.getRemoteUrl();

      let files: FileDiff[] = [];

      if (mode === "working") {
        // Unstaged changes only
        files = await getWorkingDiff(git, repoPath);
      } else if (mode === "staged") {
        // Staged changes only
        files = await getStagedDiff(git, repoPath);
      } else {
        // Branch diff against base
        files = await getBranchDiff(git, repoPath, baseBranch);
      }

      return {
        files,
        branch,
        commit,
        repo_path: repoPath,
        remote_url: remoteUrl,
        mode,
        base_branch: baseBranch,
      };
    },

    async getFileDiff(options: { baseBranch: string; mode: DiffMode; filePath: string }): Promise<FileDiff | null> {
      const { baseBranch, mode, filePath } = options;

      if (mode === "branch") {
        return getSingleBranchFileDiff(git, baseBranch, filePath);
      } else if (mode === "working") {
        return getSingleWorkingFileDiff(git, repoPath, filePath);
      } else if (mode === "staged") {
        return getSingleStagedFileDiff(git, filePath);
      }
      return null;
    },

    async stageFile(filePath: string): Promise<void> {
      await git.add(filePath);
    },

    async unstageFile(filePath: string): Promise<void> {
      await git.reset(["HEAD", "--", filePath]);
    },

    async discardFile(filePath: string): Promise<void> {
      // Check if file is untracked
      const status = await git.status();
      const isUntracked = status.not_added.includes(filePath);

      if (isUntracked) {
        // Remove untracked file
        const fullPath = join(repoPath, filePath);
        await Bun.$`rm ${fullPath}`;
      } else {
        // Restore tracked file
        await git.checkout(["--", filePath]);
      }
    },

    async commit(message: string): Promise<string> {
      const result = await git.commit(message);
      return result.commit;
    },

    async status(): Promise<StatusResult> {
      return git.status();
    },
  };
}

// Get unstaged working directory changes
async function getWorkingDiff(git: SimpleGit, repoPath: string): Promise<FileDiff[]> {
  const status = await git.status();
  const files: FileDiff[] = [];

  // Modified files (not staged)
  for (const filePath of status.modified) {
    // Skip if also in staged
    if (status.staged.includes(filePath)) continue;

    const diff = await git.diff([filePath]);
    const { additions, deletions } = countChanges(diff);

    files.push({
      path: filePath,
      status: "modified",
      additions,
      deletions,
      patch: diff,
      viewed: false,
      old_file: await getFileContents(git, "HEAD", filePath),
      new_file: await getWorkingFileContents(repoPath, filePath),
    });
  }

  // Untracked files
  for (const filePath of status.not_added) {
    const contents = await getWorkingFileContents(repoPath, filePath);
    const lines = contents?.contents.split("\n").length || 0;

    files.push({
      path: filePath,
      status: "untracked",
      additions: lines,
      deletions: 0,
      patch: createAddPatch(filePath, contents?.contents || ""),
      viewed: false,
      new_file: contents,
    });
  }

  // Deleted files (not staged)
  for (const filePath of status.deleted) {
    if (status.staged.includes(filePath)) continue;

    const oldContents = await getFileContents(git, "HEAD", filePath);
    const lines = oldContents?.contents.split("\n").length || 0;

    files.push({
      path: filePath,
      status: "deleted",
      additions: 0,
      deletions: lines,
      patch: createDeletePatch(filePath, oldContents?.contents || ""),
      viewed: false,
      old_file: oldContents,
    });
  }

  return files;
}

// Get staged changes
async function getStagedDiff(git: SimpleGit, _repoPath: string): Promise<FileDiff[]> {
  const diff = await git.diff(["--cached", "--name-status"]);
  const files: FileDiff[] = [];

  if (!diff.trim()) {
    return files;
  }

  const lines = diff.trim().split("\n");
  for (const line of lines) {
    const [status, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");

    if (!filePath) continue;

    const patchDiff = await git.diff(["--cached", "--", filePath]);
    const { additions, deletions } = countChanges(patchDiff);

    let fileStatus: FileDiff["status"] = "modified";
    if (status.startsWith("A")) fileStatus = "added";
    else if (status.startsWith("D")) fileStatus = "deleted";
    else if (status.startsWith("R")) fileStatus = "renamed";

    files.push({
      path: filePath,
      status: fileStatus,
      additions,
      deletions,
      patch: patchDiff,
      viewed: false,
      old_file: fileStatus !== "added" ? await getFileContents(git, "HEAD", filePath) : undefined,
      new_file: fileStatus !== "deleted" ? await getStagedFileContents(git, filePath) : undefined,
    });
  }

  return files;
}

// Get branch diff against base - returns file list with stats only (lazy loading)
async function getBranchDiff(git: SimpleGit, _repoPath: string, baseBranch: string): Promise<FileDiff[]> {
  // Find merge base
  let mergeBase: string;
  try {
    mergeBase = (await git.raw(["merge-base", baseBranch, "HEAD"])).trim();
  } catch {
    // Base branch might not exist, use it directly
    mergeBase = baseBranch;
  }

  // Get numstat for additions/deletions counts (single git call)
  const numstat = await git.diff([mergeBase, "--numstat"]);
  const statsMap = new Map<string, { additions: number; deletions: number }>();

  if (numstat.trim()) {
    for (const line of numstat.trim().split("\n")) {
      const [add, del, ...pathParts] = line.split("\t");
      const filePath = pathParts.join("\t");
      if (filePath) {
        statsMap.set(filePath, {
          additions: add === "-" ? 0 : parseInt(add, 10),
          deletions: del === "-" ? 0 : parseInt(del, 10),
        });
      }
    }
  }

  // Get name-status for file statuses (single git call)
  const nameStatus = await git.diff([mergeBase, "--name-status"]);
  const files: FileDiff[] = [];

  if (!nameStatus.trim()) {
    return files;
  }

  const lines = nameStatus.trim().split("\n");
  for (const line of lines) {
    const [status, ...pathParts] = line.split("\t");
    const filePath = pathParts.join("\t");

    if (!filePath) continue;

    let fileStatus: FileDiff["status"] = "modified";
    if (status.startsWith("A")) fileStatus = "added";
    else if (status.startsWith("D")) fileStatus = "deleted";
    else if (status.startsWith("R")) fileStatus = "renamed";

    const stats = statsMap.get(filePath) || { additions: 0, deletions: 0 };

    // Don't load patch or file contents - will be loaded on demand
    files.push({
      path: filePath,
      status: fileStatus,
      additions: stats.additions,
      deletions: stats.deletions,
      patch: "", // Loaded on demand
      viewed: false,
      // old_file and new_file not included - loaded on demand
    });
  }

  return files;
}

// Single file diff loaders (for lazy loading)
async function getSingleBranchFileDiff(git: SimpleGit, baseBranch: string, filePath: string): Promise<FileDiff | null> {
  let mergeBase: string;
  try {
    mergeBase = (await git.raw(["merge-base", baseBranch, "HEAD"])).trim();
  } catch {
    mergeBase = baseBranch;
  }

  try {
    const patchDiff = await git.diff([mergeBase, "--", filePath]);
    const { additions, deletions } = countChanges(patchDiff);

    // Determine status
    const nameStatus = await git.diff([mergeBase, "--name-status", "--", filePath]);
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

async function getSingleWorkingFileDiff(git: SimpleGit, repoPath: string, filePath: string): Promise<FileDiff | null> {
  const status = await git.status();

  // Check if modified
  if (status.modified.includes(filePath) && !status.staged.includes(filePath)) {
    const diff = await git.diff([filePath]);
    const { additions, deletions } = countChanges(diff);
    return {
      path: filePath,
      status: "modified",
      additions,
      deletions,
      patch: diff,
      viewed: false,
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
      new_file: contents,
    };
  }

  // Check if deleted
  if (status.deleted.includes(filePath) && !status.staged.includes(filePath)) {
    const oldContents = await getFileContents(git, "HEAD", filePath);
    const lines = oldContents?.contents.split("\n").length || 0;
    return {
      path: filePath,
      status: "deleted",
      additions: 0,
      deletions: lines,
      patch: createDeletePatch(filePath, oldContents?.contents || ""),
      viewed: false,
      old_file: oldContents,
    };
  }

  return null;
}

async function getSingleStagedFileDiff(git: SimpleGit, filePath: string): Promise<FileDiff | null> {
  try {
    const patchDiff = await git.diff(["--cached", "--", filePath]);
    if (!patchDiff.trim()) return null;

    const { additions, deletions } = countChanges(patchDiff);

    const nameStatus = await git.diff(["--cached", "--name-status", "--", filePath]);
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
      old_file: fileStatus !== "added" ? await getFileContents(git, "HEAD", filePath) : undefined,
      new_file: fileStatus !== "deleted" ? await getStagedFileContents(git, filePath) : undefined,
    };
  } catch {
    return null;
  }
}

// Helper functions
function countChanges(patch: string): { additions: number; deletions: number } {
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

async function getFileContents(git: SimpleGit, ref: string, filePath: string): Promise<FileContents | undefined> {
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

async function getWorkingFileContents(repoPath: string, filePath: string): Promise<FileContents | undefined> {
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

async function getStagedFileContents(git: SimpleGit, filePath: string): Promise<FileContents | undefined> {
  try {
    // Get from index (staged version)
    const contents = await git.show([`:${filePath}`]);
    return {
      name: basename(filePath),
      contents,
    };
  } catch {
    return undefined;
  }
}

function createAddPatch(filePath: string, contents: string): string {
  const lines = contents.split("\n");
  const patchLines = lines.map((line) => `+${line}`);
  return `diff --git a/${filePath} b/${filePath}
new file mode 100644
--- /dev/null
+++ b/${filePath}
@@ -0,0 +1,${lines.length} @@
${patchLines.join("\n")}`;
}

function createDeletePatch(filePath: string, contents: string): string {
  const lines = contents.split("\n");
  const patchLines = lines.map((line) => `-${line}`);
  return `diff --git a/${filePath} b/${filePath}
deleted file mode 100644
--- a/${filePath}
+++ /dev/null
@@ -1,${lines.length} +0,0 @@
${patchLines.join("\n")}`;
}

// Check if a path is a git repository
export async function isGitRepo(path: string): Promise<boolean> {
  try {
    const git = simpleGit(path);
    await git.status();
    return true;
  } catch {
    return false;
  }
}

// Get repo name from path
export function getRepoName(path: string): string {
  return basename(path);
}
