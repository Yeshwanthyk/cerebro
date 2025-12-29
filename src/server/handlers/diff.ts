/**
 * Diff retrieval handlers
 */
import { getGitManager } from "../../git";
import * as state from "../../state";
import type { DiffMode } from "../../types";
import { getCurrentRepoFromRequest, noRepoError } from "./utils";

export async function handleGetDiff(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const mode = (url.searchParams.get("mode") || "branch") as DiffMode;
  const compareBranch = url.searchParams.get("compare") || repo.baseBranch;
  const git = getGitManager(repo.path);

  const diff = await git.getDiff({ baseBranch: compareBranch, mode });

  // Apply viewed state
  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();
  const viewed = await state.getViewedFiles(repo.id, branch, commit);

  diff.files = diff.files.map((f) => ({
    ...f,
    viewed: viewed[f.path] || false,
  }));

  return Response.json(diff);
}

export async function handleGetFileDiff(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const filePath = url.searchParams.get("file");
  if (!filePath) {
    return Response.json({ error: "File path required" }, { status: 400 });
  }

  const mode = (url.searchParams.get("mode") || "branch") as DiffMode;
  const compareBranch = url.searchParams.get("compare") || repo.baseBranch;
  const git = getGitManager(repo.path);
  const fileDiff = await git.getFileDiff({ baseBranch: compareBranch, mode, filePath });

  if (!fileDiff) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  return Response.json(fileDiff);
}
