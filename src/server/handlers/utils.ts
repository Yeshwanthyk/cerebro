/**
 * Shared utilities for API handlers
 */
import { isGitRepo } from "../../git";
import * as state from "../../state";
import type { Repository } from "../../types";

/**
 * Get current repo from query param or state.
 * Validates that the repo path still exists and is a git repo.
 */
export async function getCurrentRepoFromRequest(url: URL): Promise<Repository | null> {
  const repoId = url.searchParams.get("repo");
  let repo: Repository | undefined;

  if (repoId) {
    repo = await state.getRepo(repoId);
  } else {
    repo = await state.getCurrentRepo();
  }

  if (!repo) {
    return null;
  }

  // Validate the repo path still exists and is a git repo
  if (!(await isGitRepo(repo.path))) {
    // The repo path no longer exists or isn't a git repo
    // Clear it as current repo if it was
    const reposState = await state.getReposState();
    if (reposState.currentRepo === repo.id) {
      await state.setCurrentRepo(null);
    }
    return null;
  }

  return repo;
}

/**
 * Standard "no repo selected" error response
 */
export function noRepoError(): Response {
  return Response.json({ error: "No repository selected" }, { status: 400 });
}
