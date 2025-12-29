/**
 * Viewed file state handlers
 */
import { getGitManager } from "../../git";
import * as state from "../../state";
import { FilePathRequestSchema, validateRequest } from "../../schemas";
import { getCurrentRepoFromRequest, noRepoError } from "./utils";

export async function handleMarkViewed(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const body = await req.json();
  const validation = validateRequest(FilePathRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();

  await state.setFileViewed(repo.id, branch, commit, validation.data.file_path, true);
  return Response.json({ success: true });
}

export async function handleUnmarkViewed(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const body = await req.json();
  const validation = validateRequest(FilePathRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();

  await state.setFileViewed(repo.id, branch, commit, validation.data.file_path, false);
  return Response.json({ success: true });
}
