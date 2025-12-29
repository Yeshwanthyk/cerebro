/**
 * Branch listing handler
 */
import { getGitManager } from "../../git";
import { getCurrentRepoFromRequest, noRepoError } from "./utils";

export async function handleGetBranches(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const git = getGitManager(repo.path);
  const branches = await git.getBranches();
  return Response.json({ branches });
}
