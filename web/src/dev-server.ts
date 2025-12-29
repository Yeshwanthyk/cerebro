/**
 * Unified development server - ONE server for both API and frontend with HMR
 * Uses shared route handlers from src/server/handlers
 */

import { resolve } from "node:path";
import { serve } from "bun";

// Import backend modules
import { getGitManager, getRepoName, isGitRepo } from "../../src/git";
import * as state from "../../src/state";

// Import shared route handling
import { matchRoute, handleRepoDelete } from "../../src/server/routes";

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
    for (const [k, v] of Object.entries(corsHeaders)) {
      headers.set(k, v);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch (error) {
    console.error("API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}

// API routing - uses shared route table
async function routeApi(req: Request, url: URL, path: string, method: string): Promise<Response> {
  // Check for dynamic DELETE route first
  if (method === "DELETE" && path.startsWith("/api/repos/")) {
    const response = await handleRepoDelete(path);
    if (response) return response;
  }

  // Match against shared route table
  const route = matchRoute(path, method);
  if (route) {
    return route.handler(req, url);
  }

  return Response.json({ error: "Not found" }, { status: 404 });
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
      if (await file.exists()) {
        return new Response(file);
      }
      return new Response("Not found", { status: 404 });
    },
    "/*": index,
  },
});

console.log(`\n🧠 Cerebro running at http://localhost:${port}`);
console.log(`⚡ HMR enabled\n`);
