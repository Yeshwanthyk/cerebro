/**
 * Git manager factory
 */
import type { SimpleGit } from "simple-git";
import { join } from "path";
import type { DiffMode, DiffResponse, FileDiff } from "../types";
import type { GitManager } from "./types";
import {
  getWorkingDiff,
  getBranchDiff,
  getSingleBranchFileDiff,
  getSingleWorkingFileDiff,
} from "./diff";

/**
 * Create a GitManager instance for a repository
 */
export function createGitManager(repoPath: string, git: SimpleGit): GitManager {
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

    async getBranches(): Promise<string[]> {
      const branches = await git.branchLocal();
      return branches.all;
    },

    async getDefaultBranch(): Promise<string> {
      // Try to detect from remote
      try {
        const remote = await git.remote(["show", "origin"]);
        if (remote) {
          const match = remote.match(/HEAD branch:\s*(\S+)/);
          if (match?.[1]) {
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

      // Run metadata fetches in parallel with diff
      const [branch, commit, remoteUrl, files] = await Promise.all([
        this.getCurrentBranch(),
        this.getCurrentCommit(),
        this.getRemoteUrl(),
        mode === "working"
          ? getWorkingDiff(git, repoPath)
          : getBranchDiff(git, repoPath, baseBranch),
      ]);

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

    async getFileDiff(options: {
      baseBranch: string;
      mode: DiffMode;
      filePath: string;
    }): Promise<FileDiff | null> {
      const { baseBranch, mode, filePath } = options;

      if (mode === "branch") {
        return getSingleBranchFileDiff(git, baseBranch, filePath);
      } else if (mode === "working") {
        return getSingleWorkingFileDiff(git, repoPath, filePath);
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

    async status() {
      return git.status();
    },
  };
}
