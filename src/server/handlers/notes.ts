/**
 * Note handlers
 */
import { getGitManager } from "../../git";
import * as state from "../../state";
import { DismissNoteRequestSchema, validateRequest } from "../../schemas";
import { getCurrentRepoFromRequest, noRepoError } from "./utils";

export async function handleGetNotes(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();

  const notes = await state.getNotes(repo.id, branch);
  return Response.json(notes);
}

export async function handleDismissNote(req: Request): Promise<Response> {
  const body = await req.json();
  const validation = validateRequest(DismissNoteRequestSchema, body);
  if (!validation.success) return validation.response;

  const success = await state.dismissNote(validation.data.note_id, validation.data.dismissed_by || "user");
  if (!success) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
