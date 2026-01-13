/**
 * Git operation handlers (stage, unstage, discard, commit)
 */
import { getGitManager } from "../../git";
import { FilePathRequestSchema, CommitRequestSchema, validateRequest } from "../../schemas";
import { getCurrentRepoFromRequest, noRepoError } from "./utils";

export async function handleStage(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const body = await req.json();
  const validation = validateRequest(FilePathRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  await git.stageFile(validation.data.file_path);
  return Response.json({ success: true });
}

export async function handleUnstage(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const body = await req.json();
  const validation = validateRequest(FilePathRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  await git.unstageFile(validation.data.file_path);
  return Response.json({ success: true });
}

export async function handleDiscard(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const body = await req.json();
  const validation = validateRequest(FilePathRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  await git.discardFile(validation.data.file_path);
  return Response.json({ success: true });
}

export async function handleCommit(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const body = await req.json();
  const validation = validateRequest(CommitRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  const commitHash = await git.commit(validation.data.message);
  return Response.json({ commit: commitHash });
}

export async function handleStageAll(_req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const git = getGitManager(repo.path);
  await git.stageAll();
  return Response.json({ success: true });
}
