/**
 * Repository management handlers
 */
import { getGitManager, isGitRepo, getRepoName } from "../../git";
import * as state from "../../state";
import { AddRepoRequestSchema, SetCurrentRepoRequestSchema, validateRequest } from "../../schemas";

export async function handleGetRepos(): Promise<Response> {
  const allRepos = await state.getRepos();
  const reposState = await state.getReposState();

  // Filter out repos whose paths no longer exist
  const validRepos = [];
  for (const repo of allRepos) {
    if (await isGitRepo(repo.path)) {
      validRepos.push(repo);
    } else {
      // Auto-remove invalid repos from the database
      await state.removeRepo(repo.id);
    }
  }

  // Clear currentRepo if it was removed
  let currentRepo: string | undefined = reposState.currentRepo;
  if (currentRepo && !validRepos.some((r) => r.id === currentRepo)) {
    await state.setCurrentRepo(null);
    currentRepo = undefined;
  }

  return Response.json({
    repos: validRepos,
    currentRepo,
  });
}

export async function handleAddRepo(req: Request): Promise<Response> {
  const body = await req.json();
  const validation = validateRequest(AddRepoRequestSchema, body);
  if (!validation.success) return validation.response;

  // Resolve to absolute path
  const { resolve } = await import("path");
  const absolutePath = resolve(validation.data.path);

  // Validate it's a git repo
  if (!(await isGitRepo(absolutePath))) {
    return Response.json({ error: "Not a git repository" }, { status: 400 });
  }

  const git = getGitManager(absolutePath);
  const baseBranch = await git.getDefaultBranch();
  const name = getRepoName(absolutePath);

  const repo = await state.addRepo(absolutePath, name, baseBranch);
  return Response.json(repo);
}

export async function handleRemoveRepo(id: string): Promise<Response> {
  const success = await state.removeRepo(id);
  if (!success) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

export async function handleSetCurrentRepo(req: Request): Promise<Response> {
  const body = await req.json();
  const validation = validateRequest(SetCurrentRepoRequestSchema, body);
  if (!validation.success) return validation.response;

  const success = await state.setCurrentRepo(validation.data.id);
  if (!success) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}
