/**
 * Diff retrieval handlers
 */
import { getGitManager } from "../../git";
import * as state from "../../state";
import * as github from "../../github";
import type { DiffMode } from "../../types";
import { getCurrentRepoFromRequest, noRepoError } from "./utils";
import { parseUnifiedDiff } from "./pr-diff.ts";

export async function handleGetDiff(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const mode = (url.searchParams.get("mode") || "branch") as DiffMode;

  // Handle PR mode
  if (mode === "pr") {
    const prNumberStr = url.searchParams.get("pr");
    if (!prNumberStr) {
      return Response.json({ error: "PR number required for pr mode" }, { status: 400 });
    }
    const prNumber = parseInt(prNumberStr, 10);
    if (Number.isNaN(prNumber)) {
      return Response.json({ error: "Invalid PR number" }, { status: 400 });
    }

    try {
      // Get PR metadata and diff in parallel
      const [pr, rawDiff] = await Promise.all([
        github.getPR(repo.path, prNumber),
        github.getPRDiff(repo.path, prNumber),
      ]);

      // Get viewed state for PR files (using PR number as key)
      const prKey = `pr-${prNumber}`;
      const viewedState = await state.getViewedFiles(repo.id, prKey, prKey);

      // Parse unified diff into FileDiff format
      const files = parseUnifiedDiff(rawDiff, viewedState);

      return Response.json({
        files,
        branch: pr.headRefName,
        commit: "",
        repo_path: repo.path,
        mode: "pr",
        base_branch: pr.baseRefName,
        pr_number: pr.number,
        pr_title: pr.title,
        pr_author: pr.author.login,
        pr_url: pr.url,
      });
    } catch (error) {
      const err = error as { message: string; code?: string };
      if (err.code === "AUTH_REQUIRED") {
        return Response.json(
          { error: "GitHub authentication required. Run 'gh auth login'" },
          { status: 401 }
        );
      }
      if (err.code === "NOT_FOUND") {
        return Response.json({ error: `PR #${prNumberStr} not found` }, { status: 404 });
      }
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // Regular branch/working mode
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

  // Handle PR mode
  if (mode === "pr") {
    const prNumberStr = url.searchParams.get("pr");
    if (!prNumberStr) {
      return Response.json({ error: "PR number required for pr mode" }, { status: 400 });
    }
    const prNumber = parseInt(prNumberStr, 10);
    if (Number.isNaN(prNumber)) {
      return Response.json({ error: "Invalid PR number" }, { status: 400 });
    }

    try {
      // Get PR details for branch names
      const [pr, rawDiff] = await Promise.all([
        github.getPR(repo.path, prNumber),
        github.getPRDiff(repo.path, prNumber),
      ]);
      
      const files = parseUnifiedDiff(rawDiff, {});
      const fileDiff = files.find((f) => f.path === filePath);

      if (!fileDiff) {
        return Response.json({ error: "File not found in PR diff" }, { status: 404 });
      }

      // Fetch actual file contents from GitHub for proper diff rendering
      const [oldContents, newContents] = await Promise.all([
        fileDiff.status !== "added" 
          ? github.getFileContents(repo.path, filePath, pr.baseRefName)
          : Promise.resolve(null),
        fileDiff.status !== "deleted"
          ? github.getFileContents(repo.path, filePath, pr.headRefName)
          : Promise.resolve(null),
      ]);

      // Add file contents for diff rendering
      if (oldContents !== null || fileDiff.status === "added") {
        fileDiff.old_file = { 
          name: filePath, 
          contents: oldContents ?? "" 
        };
      }
      if (newContents !== null || fileDiff.status === "deleted") {
        fileDiff.new_file = { 
          name: filePath, 
          contents: newContents ?? "" 
        };
      }

      return Response.json(fileDiff);
    } catch (error) {
      const err = error as { message: string; code?: string };
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  // Regular branch/working mode
  const compareBranch = url.searchParams.get("compare") || repo.baseBranch;
  const git = getGitManager(repo.path);
  const fileDiff = await git.getFileDiff({ baseBranch: compareBranch, mode, filePath });

  if (!fileDiff) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  return Response.json(fileDiff);
}
