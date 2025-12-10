import type { Server } from "bun";
import { getGitManager, isGitRepo, getRepoName } from "../git";
import * as state from "../state";
import type { DiffMode, Repository } from "../types";
import {
  AddRepoRequestSchema,
  SetCurrentRepoRequestSchema,
  FilePathRequestSchema,
  CommitRequestSchema,
  AddCommentRequestSchema,
  ResolveCommentRequestSchema,
  DismissNoteRequestSchema,
  validateRequest,
} from "../schemas";

export interface ServerOptions {
  port: number;
  // Optional embedded assets map (used by single-binary build)
  assets?: Map<string, { content: string; mimeType: string }>;
}

type BunServer = Server<unknown>;

let serverInstance: BunServer | null = null;

export function getServer(): BunServer | null {
  return serverInstance;
}

export async function startServer(options: ServerOptions): Promise<BunServer> {
  const { port } = options;

  // Embedded assets (populated during build)
  const embeddedAssets: Map<string, { content: string; mimeType: string }> =
    options.assets ||
    // Allow single-binary build to inject assets via globalThis
    ((globalThis as any).__EMBEDDED_ASSETS__ as Map<string, { content: string; mimeType: string }>) ||
    new Map();

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

  // Branches route
  if (path === "/api/branches" && method === "GET") {
    return handleGetBranches(url);
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

  // Directory browsing
  if (path === "/api/browse" && method === "GET") {
    return handleBrowseDirectory(url);
  }

  // Health check
  if (path === "/api/health") {
    return Response.json({ status: "ok" });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}

// Helper to get current repo from query or state
// Also validates that the repo path still exists
async function getCurrentRepoFromRequest(url: URL): Promise<Repository | null> {
  const repoId = url.searchParams.get("repo");
  let repo: Repository | undefined;

  if (repoId) {
    repo = await state.getRepo(repoId);
  } else {
    repo = await state.getCurrentRepo();
  }

  if (!repo) {
    return null;
  }

  // Validate the repo path still exists and is a git repo
  if (!(await isGitRepo(repo.path))) {
    // The repo path no longer exists or isn't a git repo
    // Clear it as current repo if it was
    const reposState = await state.getReposState();
    if (reposState.currentRepo === repo.id) {
      await state.setCurrentRepo(null);
    }
    return null;
  }

  return repo;
}

// Repository handlers
async function handleGetRepos(): Promise<Response> {
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
  if (currentRepo && !validRepos.some(r => r.id === currentRepo)) {
    await state.setCurrentRepo(null);
    currentRepo = undefined;
  }

  return Response.json({
    repos: validRepos,
    currentRepo,
  });
}

async function handleAddRepo(req: Request): Promise<Response> {
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

async function handleRemoveRepo(id: string): Promise<Response> {
  const success = await state.removeRepo(id);
  if (!success) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

async function handleSetCurrentRepo(req: Request): Promise<Response> {
  const body = await req.json();
  const validation = validateRequest(SetCurrentRepoRequestSchema, body);
  if (!validation.success) return validation.response;

  const success = await state.setCurrentRepo(validation.data.id);
  if (!success) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

// Branches handler
async function handleGetBranches(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }
  const git = getGitManager(repo.path);
  const branches = await git.getBranches();
  return Response.json({ branches });
}

// Diff handler
async function handleGetDiff(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const mode = (url.searchParams.get("mode") || "branch") as DiffMode;
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
  const compareBranch = url.searchParams.get("compare") || repo.baseBranch;
  const git = getGitManager(repo.path);
  const fileDiff = await git.getFileDiff({ baseBranch: compareBranch, mode, filePath });

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
  const validation = validateRequest(FilePathRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  const branch = await git.getCurrentBranch();
  const commit = await git.getCurrentCommit();

  await state.setFileViewed(repo.id, branch, commit, validation.data.file_path, true);
  return Response.json({ success: true });
}

async function handleUnmarkViewed(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
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

// Git operation handlers
async function handleStage(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const validation = validateRequest(FilePathRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  await git.stageFile(validation.data.file_path);
  return Response.json({ success: true });
}

async function handleUnstage(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const validation = validateRequest(FilePathRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  await git.unstageFile(validation.data.file_path);
  return Response.json({ success: true });
}

async function handleDiscard(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const validation = validateRequest(FilePathRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  await git.discardFile(validation.data.file_path);
  return Response.json({ success: true });
}

async function handleCommit(req: Request, url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const body = await req.json();
  const validation = validateRequest(CommitRequestSchema, body);
  if (!validation.success) return validation.response;

  const git = getGitManager(repo.path);
  const commitHash = await git.commit(validation.data.message);
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

async function handleResolveComment(req: Request, url: URL): Promise<Response> {
  const body = await req.json();
  const validation = validateRequest(ResolveCommentRequestSchema, body);
  if (!validation.success) return validation.response;

  const success = await state.resolveComment(validation.data.comment_id, validation.data.resolved_by || "user");
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

async function handleDismissNote(req: Request, _url: URL): Promise<Response> {
  const body = await req.json();
  const validation = validateRequest(DismissNoteRequestSchema, body);
  if (!validation.success) return validation.response;

  const success = await state.dismissNote(validation.data.note_id, validation.data.dismissed_by || "user");
  if (!success) {
    return Response.json({ error: "Note not found" }, { status: 404 });
  }
  return Response.json({ success: true });
}

// Directory browser handler
async function handleBrowseDirectory(url: URL): Promise<Response> {
  const { readdir, stat } = await import("fs/promises");
  const { join, dirname, resolve } = await import("path");
  const { homedir } = await import("os");

  let targetPath = url.searchParams.get("path") || homedir();
  targetPath = resolve(targetPath);

  try {
    const stats = await stat(targetPath);
    if (!stats.isDirectory()) {
      targetPath = dirname(targetPath);
    }
  } catch {
    // Path doesn't exist, fall back to home
    targetPath = homedir();
  }

  const entries: { name: string; path: string; type: "directory" | "file"; isGitRepo: boolean }[] = [];

  try {
    const items = await readdir(targetPath, { withFileTypes: true });
    
    for (const item of items) {
      // Skip hidden files/dirs except .git indicator
      if (item.name.startsWith(".") && item.name !== ".git") continue;
      if (item.name === ".git") continue; // Don't show .git dir itself
      
      const fullPath = join(targetPath, item.name);
      const isDir = item.isDirectory();
      
      if (!isDir) continue; // Only show directories for repo picker
      
      // Check if it's a git repo
      let isRepo = false;
      try {
        const gitPath = join(fullPath, ".git");
        const gitStats = await stat(gitPath);
        isRepo = gitStats.isDirectory();
      } catch {
        // Not a git repo
      }
      
      entries.push({
        name: item.name,
        path: fullPath,
        type: "directory",
        isGitRepo: isRepo,
      });
    }
    
    // Sort: git repos first, then alphabetical
    entries.sort((a, b) => {
      if (a.isGitRepo && !b.isGitRepo) return -1;
      if (!a.isGitRepo && b.isGitRepo) return 1;
      return a.name.localeCompare(b.name);
    });
    
  } catch (err) {
    return Response.json({ 
      error: "Cannot read directory",
      currentPath: targetPath,
      parentPath: dirname(targetPath),
      entries: []
    }, { status: 400 });
  }

  // Check if current directory is a git repo
  let currentIsGitRepo = false;
  try {
    const gitPath = join(targetPath, ".git");
    const gitStats = await stat(gitPath);
    currentIsGitRepo = gitStats.isDirectory();
  } catch {
    // Not a git repo
  }

  return Response.json({
    currentPath: targetPath,
    parentPath: dirname(targetPath) !== targetPath ? dirname(targetPath) : null,
    currentIsGitRepo,
    entries,
  });
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
