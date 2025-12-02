import type { Server } from "bun";
import { getGitManager, isGitRepo, getRepoName } from "../git";
import * as state from "../state";
import type { DiffMode, Repository } from "../types";

export interface ServerOptions {
  port: number;
}

type BunServer = Server<unknown>;

let serverInstance: BunServer | null = null;

export function getServer(): BunServer | null {
  return serverInstance;
}

export async function startServer(options: ServerOptions): Promise<BunServer> {
  const { port } = options;

  // Embedded assets (populated during build)
  const embeddedAssets: Map<string, { content: string; mimeType: string }> = new Map();

  // CORS headers helper
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  serverInstance = Bun.serve({
    port,
    idleTimeout: 30,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // Handle preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // API routes
      if (path.startsWith("/api/")) {
        try {
          const response = await handleApi(req, url);
          const headers = new Headers(response.headers);
          for (const [key, value] of Object.entries(corsHeaders)) {
            headers.set(key, value);
          }
          return new Response(response.body, {
            status: response.status,
            headers,
          });
        } catch (error) {
          console.error("API error:", error);
          return Response.json(
            { error: error instanceof Error ? error.message : "Internal server error" },
            { status: 500, headers: corsHeaders }
          );
        }
      }

      // Production: serve from embedded assets
      return serveStatic(path, embeddedAssets);
    },
  });

  console.log(`Server running at http://localhost:${port}`);
  return serverInstance;
}

export function stopServer(): void {
  if (serverInstance) {
    serverInstance.stop();
    serverInstance = null;
  }
}

// API route handler
async function handleApi(req: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = req.method;

  // Repository routes
  if (path === "/api/repos") {
    if (method === "GET") {
      return handleGetRepos();
    }
    if (method === "POST") {
      return handleAddRepo(req);
    }
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
    if (method === "GET") {
      return handleGetComments(url);
    }
    if (method === "POST") {
      return handleAddComment(req, url);
    }
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

  // Health check
  if (path === "/api/health") {
    return Response.json({ status: "ok" });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

// Helper to get current repo from query or state
async function getCurrentRepoFromRequest(url: URL): Promise<Repository | null> {
  const repoId = url.searchParams.get("repo");
  if (repoId) {
    const repo = await state.getRepo(repoId);
    return repo || null;
  }
  const current = await state.getCurrentRepo();
  return current || null;
}

// Repository handlers
async function handleGetRepos(): Promise<Response> {
  const repos = await state.getRepos();
  const reposState = await state.getReposState();
  return Response.json({
    repos,
    currentRepo: reposState.currentRepo,
  });
}

async function handleAddRepo(req: Request): Promise<Response> {
  const body = await req.json();
  const { path } = body as { path: string };

  if (!path) {
    return Response.json({ error: "Path is required" }, { status: 400 });
  }

  // Validate it's a git repo
  if (!(await isGitRepo(path))) {
    return Response.json({ error: "Not a git repository" }, { status: 400 });
  }

  const git = getGitManager(path);
  const baseBranch = await git.getDefaultBranch();
  const name = getRepoName(path);

  const repo = await state.addRepo(path, name, baseBranch);
  return Response.json(repo);
}

async function handleRemoveRepo(id: string): Promise<Response> {
  const success = await state.removeRepo(id);
  if (!success) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

async function handleSetCurrentRepo(req: Request): Promise<Response> {
  const body = await req.json();
  const { id } = body as { id: string };

  const success = await state.setCurrentRepo(id);
  if (!success) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

// Diff handler
async function handleGetDiff(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const mode = (url.searchParams.get("mode") || "branch") as DiffMode;
  const git = getGitManager(repo.path);

  const diff = await git.getDiff({ baseBranch: repo.baseBranch, mode });

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

// Single file diff handler (lazy loading)
async function handleGetFileDiff(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const filePath = url.searchParams.get("file");
  if (!filePath) {
    return Response.json({ error: "File path required" }, { status: 400 });
  }

  const mode = (url.searchParams.get("mode") || "branch") as DiffMode;
  const git = getGitManager(repo.path);
  const fileDiff = await git.getFileDiff({ baseBranch: repo.baseBranch, mode, filePath });

  if (!fileDiff) {
    return Response.json({ error: "File not found" }, { status: 404 });
  }

  return Response.json(fileDiff);
}

// Viewed file handlers
async function handleMarkViewed(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const { file_path } = body as { file_path: string };

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();

  await state.setFileViewed(repo.id, branch, commit, file_path, true);
  return Response.json({ success: true });
}

async function handleUnmarkViewed(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const { file_path } = body as { file_path: string };

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();

  await state.setFileViewed(repo.id, branch, commit, file_path, false);
  return Response.json({ success: true });
}

// Git operation handlers
async function handleStage(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const { file_path } = body as { file_path: string };

  const git = getGitManager(repo.path);
  await git.stageFile(file_path);
  return Response.json({ success: true });
}

async function handleUnstage(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const { file_path } = body as { file_path: string };

  const git = getGitManager(repo.path);
  await git.unstageFile(file_path);
  return Response.json({ success: true });
}

async function handleDiscard(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const { file_path } = body as { file_path: string };

  const git = getGitManager(repo.path);
  await git.discardFile(file_path);
  return Response.json({ success: true });
}

async function handleCommit(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const { message } = body as { message: string };

  if (!message) {
    return Response.json({ error: "Commit message is required" }, { status: 400 });
  }

  const git = getGitManager(repo.path);
  const commitHash = await git.commit(message);
  return Response.json({ commit: commitHash });
}

// Comment handlers
async function handleGetComments(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();

  const comments = await state.getComments(repo.id, branch);
  return Response.json(comments);
}

async function handleAddComment(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const { file_path, line_number, text } = body as {
    file_path: string;
    line_number?: number;
    text: string;
  };

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();

  const comment = await state.addComment(repo.id, {
    file_path,
    line_number,
    text,
    branch,
    commit,
  });

  return Response.json(comment);
}

async function handleResolveComment(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const { comment_id, resolved_by } = body as { comment_id: string; resolved_by?: string };

  const success = await state.resolveComment(repo.id, comment_id, resolved_by || "user");
  if (!success) {
    return Response.json({ error: "Comment not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

// Note handlers
async function handleGetNotes(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();

  const notes = await state.getNotes(repo.id, branch);
  return Response.json(notes);
}

async function handleDismissNote(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const { note_id, dismissed_by } = body as { note_id: string; dismissed_by?: string };

  const success = await state.dismissNote(repo.id, note_id, dismissed_by || "user");
  if (!success) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

// Static file serving (production only - assets embedded in binary)
function serveStatic(
  path: string,
  embeddedAssets: Map<string, { content: string; mimeType: string }>
): Response {
  // Normalize path
  let filePath = path === "/" ? "/index.html" : path;

  // Check embedded assets (production)
  const embedded = embeddedAssets.get(filePath) || embeddedAssets.get(filePath.slice(1));
  if (embedded) {
    const content = Buffer.from(embedded.content, "base64");
    return new Response(content, {
      headers: { "Content-Type": embedded.mimeType },
    });
  }

  // Fallback: return index.html for SPA routing
  const indexAsset = embeddedAssets.get("index.html") || embeddedAssets.get("/index.html");
  if (indexAsset) {
    const content = Buffer.from(indexAsset.content, "base64");
    return new Response(content, {
      headers: { "Content-Type": "text/html" },
    });
  }

  return new Response("Not found", { status: 404 });
}
