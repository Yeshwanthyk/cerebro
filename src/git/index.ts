/**
 * Git module - provides git operations for repositories
 */
import simpleGit from "simple-git";
import type { GitManager } from "./types";
import { createGitManager } from "./manager";

// Re-export types and utilities
export type { GitManager } from "./types";
export { isGitRepo, getRepoName } from "./utils";
export * from "./commits";

// Cache of git managers by repo path
const managers = new Map<string, GitManager>();

/**
 * Get or create a GitManager for a repository path.
 * Managers are cached by path.
 */
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
