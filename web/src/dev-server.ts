/**
 * Unified development server - ONE server for both API and frontend with HMR
 */
import { serve } from "bun";
import { resolve } from "path";

// Import backend modules
import { getGitManager, isGitRepo, getRepoName } from "../../src/git";
import * as state from "../../src/state";
import type { DiffMode, Repository } from "../../src/types";

// Import HTML for HMR
import index from "./index.html";

const port = 3030;

// Check if we have a saved current repo, otherwise use cwd
const existingRepo = await state.getCurrentRepo();
if (!existingRepo) {
  const repoPath = resolve(process.cwd());
  if (await isGitRepo(repoPath)) {
    const git = getGitManager(repoPath);
    const baseBranch = await git.getDefaultBranch();
    const name = getRepoName(repoPath);
    const repo = await state.addRepo(repoPath, name, baseBranch);
    await state.setCurrentRepo(repo.id);
  }
}

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// API handler
async function handleApi(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // Handle preflight
  if (method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const response = await routeApi(req, url, path, method);
    const headers = new Headers(response.headers);
    Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    console.error("API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// API routing
async function routeApi(req: Request, url: URL, path: string, method: string): Promise<Response> {
  // Health check
  if (path === "/api/health") {
    return Response.json({ status: "ok" });
  }

  // Repository routes
  if (path === "/api/repos") {
    if (method === "GET") return handleGetRepos();
    if (method === "POST") return handleAddRepo(req);
  }

  if (path.startsWith("/api/repos/") && method === "DELETE") {
    const id = path.split("/")[3];
    return handleRemoveRepo(id);
  }

  if (path === "/api/repos/current" && method === "POST") {
    return handleSetCurrentRepo(req);
  }

  // Diff routes
  if (path === "/api/diff" && method === "GET") {
    return handleGetDiff(url);
  }

  if (path === "/api/file-diff" && method === "GET") {
    return handleGetFileDiff(url);
  }

  // Viewed files
  if (path === "/api/mark-viewed" && method === "POST") {
    return handleMarkViewed(req, url);
  }

  if (path === "/api/unmark-viewed" && method === "POST") {
    return handleUnmarkViewed(req, url);
  }

  // Git operations
  if (path === "/api/stage" && method === "POST") {
    return handleStage(req, url);
  }

  if (path === "/api/unstage" && method === "POST") {
    return handleUnstage(req, url);
  }

  if (path === "/api/discard" && method === "POST") {
    return handleDiscard(req, url);
  }

  if (path === "/api/commit" && method === "POST") {
    return handleCommit(req, url);
  }

  // Comments
  if (path === "/api/comments") {
    if (method === "GET") return handleGetComments(url);
    if (method === "POST") return handleAddComment(req, url);
  }

  if (path === "/api/comments/resolve" && method === "POST") {
    return handleResolveComment(req, url);
  }

  // Notes
  if (path === "/api/notes" && method === "GET") {
    return handleGetNotes(url);
  }

  if (path === "/api/notes/dismiss" && method === "POST") {
    return handleDismissNote(req, url);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

// Helper to get current repo
async function getCurrentRepoFromRequest(url: URL): Promise<Repository | null> {
  const repoId = url.searchParams.get("repo");
  if (repoId) {
    return (await state.getRepo(repoId)) || null;
  }
  return (await state.getCurrentRepo()) || null;
}

// API Handlers
async function handleGetRepos(): Promise<Response> {
  const repos = await state.getRepos();
  const reposState = await state.getReposState();
  return Response.json({ repos, currentRepo: reposState.currentRepo });
}

async function handleAddRepo(req: Request): Promise<Response> {
  const { path } = (await req.json()) as { path: string };
  if (!path) return Response.json({ error: "Path is required" }, { status: 400 });
  if (!(await isGitRepo(path))) return Response.json({ error: "Not a git repository" }, { status: 400 });

  const git = getGitManager(path);
  const baseBranch = await git.getDefaultBranch();
  const name = getRepoName(path);
  const repo = await state.addRepo(path, name, baseBranch);
  return Response.json(repo);
}

async function handleRemoveRepo(id: string): Promise<Response> {
  const success = await state.removeRepo(id);
  if (!success) return Response.json({ error: "Repository not found" }, { status: 404 });
  return Response.json({ success: true });
}

async function handleSetCurrentRepo(req: Request): Promise<Response> {
  const { id } = (await req.json()) as { id: string };
  const success = await state.setCurrentRepo(id);
  if (!success) return Response.json({ error: "Repository not found" }, { status: 404 });
  return Response.json({ success: true });
}

async function handleGetDiff(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const mode = (url.searchParams.get("mode") || "branch") as DiffMode;
  const git = getGitManager(repo.path);
  const diff = await git.getDiff({ baseBranch: repo.baseBranch, mode });

  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();
  const viewed = await state.getViewedFiles(repo.id, branch, commit);

  diff.files = diff.files.map((f) => ({ ...f, viewed: viewed[f.path] || false }));
  return Response.json(diff);
}

async function handleGetFileDiff(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const filePath = url.searchParams.get("file");
  if (!filePath) return Response.json({ error: "File path required" }, { status: 400 });

  const mode = (url.searchParams.get("mode") || "branch") as DiffMode;
  const git = getGitManager(repo.path);
  const fileDiff = await git.getFileDiff({ baseBranch: repo.baseBranch, mode, filePath });

  if (!fileDiff) return Response.json({ error: "File not found" }, { status: 404 });

  return Response.json(fileDiff);
}

async function handleMarkViewed(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const { file_path } = (await req.json()) as { file_path: string };
  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();

  await state.setFileViewed(repo.id, branch, commit, file_path, true);
  return Response.json({ success: true });
}

async function handleUnmarkViewed(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const { file_path } = (await req.json()) as { file_path: string };
  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();

  await state.setFileViewed(repo.id, branch, commit, file_path, false);
  return Response.json({ success: true });
}

async function handleStage(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const { file_path } = (await req.json()) as { file_path: string };
  const git = getGitManager(repo.path);
  await git.stageFile(file_path);
  return Response.json({ success: true });
}

async function handleUnstage(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const { file_path } = (await req.json()) as { file_path: string };
  const git = getGitManager(repo.path);
  await git.unstageFile(file_path);
  return Response.json({ success: true });
}

async function handleDiscard(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const { file_path } = (await req.json()) as { file_path: string };
  const git = getGitManager(repo.path);
  await git.discardFile(file_path);
  return Response.json({ success: true });
}

async function handleCommit(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const { message } = (await req.json()) as { message: string };
  if (!message) return Response.json({ error: "Commit message is required" }, { status: 400 });

  const git = getGitManager(repo.path);
  const commitHash = await git.commit(message);
  return Response.json({ commit: commitHash });
}

async function handleGetComments(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const comments = await state.getComments(repo.id, branch);
  return Response.json(comments);
}

async function handleAddComment(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const { file_path, line_number, text } = (await req.json()) as {
    file_path: string;
    line_number?: number;
    text: string;
  };

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();

  const comment = await state.addComment(repo.id, { file_path, line_number, text, branch, commit });
  return Response.json(comment);
}

async function handleResolveComment(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const { comment_id, resolved_by } = (await req.json()) as { comment_id: string; resolved_by?: string };
  const success = await state.resolveComment(repo.id, comment_id, resolved_by || "user");
  if (!success) return Response.json({ error: "Comment not found" }, { status: 404 });
  return Response.json({ success: true });
}

async function handleGetNotes(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const notes = await state.getNotes(repo.id, branch);
  return Response.json(notes);
}

async function handleDismissNote(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) return Response.json({ error: "No repository selected" }, { status: 400 });

  const { note_id, dismissed_by } = (await req.json()) as { note_id: string; dismissed_by?: string };
  const success = await state.dismissNote(repo.id, note_id, dismissed_by || "user");
  if (!success) return Response.json({ error: "Note not found" }, { status: 404 });
  return Response.json({ success: true });
}

// Start server with routes config (required for HTMLBundle HMR)
serve({
  port,
  development: {
    hmr: true,
    console: true,
  },
  routes: {
    "/api/*": handleApi,
    "/images/*": async (req) => {
      const url = new URL(req.url);
      const file = Bun.file(`./web/src${url.pathname}`);
      if (await file.exists()) return new Response(file);
      return new Response("Not found", { status: 404 });
    },
    "/*": index,
  },
});

console.log(`\n🧠 Cerebro running at http://localhost:${port}`);
console.log(`⚡ HMR enabled\n`);
