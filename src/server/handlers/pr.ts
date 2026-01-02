/**
 * Pull Request handlers - GitHub PR operations via gh CLI
 */
import * as state from "../../state";
import * as github from "../../github";
import { PRReviewRequestSchema, validateRequest } from "../../schemas";
import { parseUnifiedDiff } from "./pr-diff.ts";

/**
 * GET /api/prs - List open PRs for current repo
 */
export async function handleGetPRs(url: URL): Promise<Response> {
  const repoId = url.searchParams.get("repo");
  const repo = repoId ? await state.getRepo(repoId) : await state.getCurrentRepo();

  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  try {
    const prs = await github.listPRs(repo.path);
    return Response.json({ prs, repo_path: repo.path });
  } catch (error) {
    const err = error as { message: string; code?: string };
    if (err.code === "AUTH_REQUIRED") {
      return Response.json(
        { error: "GitHub authentication required. Run 'gh auth login'" },
        { status: 401 }
      );
    }
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/pr/:number - Get PR details
 */
export async function handleGetPR(prNumber: number, url: URL): Promise<Response> {
  const repoId = url.searchParams.get("repo");
  const repo = repoId ? await state.getRepo(repoId) : await state.getCurrentRepo();

  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  try {
    const pr = await github.getPR(repo.path, prNumber);
    return Response.json({ pr, repo_path: repo.path });
  } catch (error) {
    const err = error as { message: string; code?: string };
    if (err.code === "NOT_FOUND") {
      return Response.json({ error: `PR #${prNumber} not found` }, { status: 404 });
    }
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/diff?mode=pr&pr=<number> - Get PR diff in Cerebro format
 */
export async function handleGetPRDiff(prNumber: number, url: URL): Promise<Response> {
  const repoId = url.searchParams.get("repo");
  const repo = repoId ? await state.getRepo(repoId) : await state.getCurrentRepo();

  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  try {
    // Get PR metadata and diff in parallel
    const [pr, rawDiff] = await Promise.all([
      github.getPR(repo.path, prNumber),
      github.getPRDiff(repo.path, prNumber),
    ]);

    // Get viewed state for PR files (using PR number as "branch" key)
    const prKey = `pr-${prNumber}`;
    const viewedState = await state.getViewedFiles(repo.id, prKey, prKey);

    // Parse unified diff into FileDiff format
    const files = parseUnifiedDiff(rawDiff, viewedState);

    return Response.json({
      files,
      branch: pr.headRefName,
      commit: "", // PR doesn't have a single commit
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
    if (err.code === "NOT_FOUND") {
      return Response.json({ error: `PR #${prNumber} not found` }, { status: 404 });
    }
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/pr/review - Approve, comment, or request changes on a PR
 */
export async function handlePRReview(req: Request, url: URL): Promise<Response> {
  const body = await req.json();
  const validation = validateRequest(PRReviewRequestSchema, body);

  if (!validation.success) {
    return validation.response;
  }

  const { pr, action, body: reviewBody } = validation.data;

  const repoId = url.searchParams.get("repo");
  const repo = repoId ? await state.getRepo(repoId) : await state.getCurrentRepo();

  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  try {
    switch (action) {
      case "approve":
        await github.approvePR(repo.path, pr, reviewBody);
        return Response.json({ success: true, message: `PR #${pr} approved` });

      case "comment":
        if (!reviewBody) {
          return Response.json({ error: "Body required for comment" }, { status: 400 });
        }
        await github.commentOnPR(repo.path, pr, reviewBody);
        return Response.json({ success: true, message: `Comment added to PR #${pr}` });

      case "request-changes":
        if (!reviewBody) {
          return Response.json({ error: "Body required for request-changes" }, { status: 400 });
        }
        await github.requestChanges(repo.path, pr, reviewBody);
        return Response.json({ success: true, message: `Changes requested on PR #${pr}` });

      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    const err = error as { message: string; code?: string };
    return Response.json({ error: err.message }, { status: 500 });
  }
}
