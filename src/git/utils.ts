/**
 * Git utility functions
 */
import simpleGit from "simple-git";
import { basename } from "path";

/**
 * Check if a path is a git repository
 */
export async function isGitRepo(path: string): Promise<boolean> {
  try {
    const git = simpleGit(path);
    await git.status();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get repo name from path (basename)
 */
export function getRepoName(path: string): string {
  return basename(path);
}
