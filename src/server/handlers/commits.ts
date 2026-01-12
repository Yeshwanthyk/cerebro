/**
 * Commit handlers - list and view commit diffs
 */
import { getGitManager, listCommits, getCommitDiff, getCommitFileDiff, getCommitInfo } from "../../git";
import * as state from "../../state";
import { getCurrentRepoFromRequest, noRepoError } from "./utils";

/**
 * GET /api/commits - List recent commits
 */
export async function handleGetCommits(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  try {
    const git = getGitManager(repo.path);
    const commits = await listCommits(git.git, limit);
    return Response.json({ commits, repo_path: repo.path });
  } catch (error) {
    const err = error as { message: string };
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/diff?mode=commit&commit=<sha> - Get commit diff
 */
export async function handleGetCommitDiff(
  url: URL,
  sha: string
): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  try {
    const git = getGitManager(repo.path);
    const [files, commitInfo, branch] = await Promise.all([
      getCommitDiff(git.git, sha),
      getCommitInfo(git.git, sha),
      git.getCurrentBranch(),
    ]);

    if (!commitInfo) {
      return Response.json({ error: "Commit not found" }, { status: 404 });
    }

    // Get viewed state for this commit
    const viewedState = await state.getViewedFiles(repo.id, `commit-${sha}`, sha);
    const filesWithViewed = files.map((f) => ({
      ...f,
      viewed: viewedState[f.path] ?? false,
    }));

    return Response.json({
      files: filesWithViewed,
      branch,
      commit: sha,
      repo_path: repo.path,
      mode: "commit",
      base_branch: "",
      commit_sha: sha,
      commit_message: commitInfo.message,
      commit_author: commitInfo.author,
      commit_date: commitInfo.date,
    });
  } catch (error) {
    const err = error as { message: string };
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/file-diff?mode=commit&commit=<sha>&file=<path>
 */
export async function handleGetCommitFileDiff(
  url: URL,
  sha: string,
  filePath: string
): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  try {
    const git = getGitManager(repo.path);
    const fileDiff = await getCommitFileDiff(git.git, sha, filePath);

    if (!fileDiff) {
      return Response.json({ error: "File not found in commit" }, { status: 404 });
    }

    return Response.json(fileDiff);
  } catch (error) {
    const err = error as { message: string };
    return Response.json({ error: err.message }, { status: 500 });
  }
}
