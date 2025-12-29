/**
 * Comment handlers
 */
import { getGitManager } from "../../git";
import * as state from "../../state";
import { AddCommentRequestSchema, ResolveCommentRequestSchema, validateRequest } from "../../schemas";
import { getCurrentRepoFromRequest, noRepoError } from "./utils";

export async function handleGetComments(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();

  const comments = await state.getComments(repo.id, branch);
  return Response.json(comments);
}

export async function handleAddComment(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const body = await req.json();
  const validation = validateRequest(AddCommentRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();

  const comment = await state.addComment(repo.id, {
    file_path: validation.data.file_path,
    line_number: validation.data.line_number,
    text: validation.data.text,
    branch,
    commit,
  });

  return Response.json(comment);
}

export async function handleResolveComment(req: Request): Promise<Response> {
  const body = await req.json();
  const validation = validateRequest(ResolveCommentRequestSchema, body);
  if (!validation.success) return validation.response;

  const success = await state.resolveComment(validation.data.comment_id, validation.data.resolved_by || "user");
  if (!success) {
    return Response.json({ error: "Comment not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
