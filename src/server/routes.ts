/**
 * API Route Table - single source of truth for all API routes
 * Used by both production server and dev server
 */
import {
  handleGetRepos,
  handleAddRepo,
  handleRemoveRepo,
  handleSetCurrentRepo,
  handleGetBranches,
  handleBrowseDirectory,
  handleGetDiff,
  handleGetFileDiff,
  handleMarkViewed,
  handleUnmarkViewed,
  handleStage,
  handleUnstage,
  handleDiscard,
  handleCommit,
  handleGetComments,
  handleAddComment,
  handleResolveComment,
  handleGetNotes,
  handleDismissNote,
  handleGetPRs,
  handlePRReview,
  handleGetCommits,
} from "./handlers";

export type RouteHandler = (req: Request, url: URL) => Promise<Response>;

export interface Route {
  path: string;
  method: string;
  handler: RouteHandler;
}

/**
 * All API routes. Order matters for path matching.
 */
export const routes: Route[] = [
  // Health check
  { path: "/api/health", method: "GET", handler: async () => Response.json({ status: "ok" }) },

  // Repository management
  { path: "/api/repos", method: "GET", handler: async () => handleGetRepos() },
  { path: "/api/repos", method: "POST", handler: async (req) => handleAddRepo(req) },
  { path: "/api/repos/current", method: "POST", handler: async (req) => handleSetCurrentRepo(req) },

  // Branches
  { path: "/api/branches", method: "GET", handler: async (_req, url) => handleGetBranches(url) },

  // Directory browsing
  { path: "/api/browse", method: "GET", handler: async (_req, url) => handleBrowseDirectory(url) },

  // Diff
  { path: "/api/diff", method: "GET", handler: async (_req, url) => handleGetDiff(url) },
  { path: "/api/file-diff", method: "GET", handler: async (_req, url) => handleGetFileDiff(url) },

  // Viewed files
  { path: "/api/mark-viewed", method: "POST", handler: async (req, url) => handleMarkViewed(req, url) },
  { path: "/api/unmark-viewed", method: "POST", handler: async (req, url) => handleUnmarkViewed(req, url) },

  // Git operations
  { path: "/api/stage", method: "POST", handler: async (req, url) => handleStage(req, url) },
  { path: "/api/unstage", method: "POST", handler: async (req, url) => handleUnstage(req, url) },
  { path: "/api/discard", method: "POST", handler: async (req, url) => handleDiscard(req, url) },
  { path: "/api/commit", method: "POST", handler: async (req, url) => handleCommit(req, url) },

  // Comments
  { path: "/api/comments", method: "GET", handler: async (_req, url) => handleGetComments(url) },
  { path: "/api/comments", method: "POST", handler: async (req, url) => handleAddComment(req, url) },
  { path: "/api/comments/resolve", method: "POST", handler: async (req) => handleResolveComment(req) },

  // Notes
  { path: "/api/notes", method: "GET", handler: async (_req, url) => handleGetNotes(url) },
  { path: "/api/notes/dismiss", method: "POST", handler: async (req) => handleDismissNote(req) },

  // Pull Requests
  { path: "/api/prs", method: "GET", handler: async (_req, url) => handleGetPRs(url) },
  { path: "/api/pr/review", method: "POST", handler: async (req, url) => handlePRReview(req, url) },

  // Commits
  { path: "/api/commits", method: "GET", handler: async (_req, url) => handleGetCommits(url) },
];

/**
 * Match a request to a route handler.
 * Returns null if no match found.
 */
export function matchRoute(path: string, method: string): Route | null {
  // Exact matches first
  for (const route of routes) {
    if (route.path === path && route.method === method) {
      return route;
    }
  }
  return null;
}

/**
 * Special handler for DELETE /api/repos/:id
 * This needs dynamic path matching
 */
export async function handleRepoDelete(path: string): Promise<Response | null> {
  const match = path.match(/^\/api\/repos\/([^/]+)$/);
  if (match?.[1]) {
    return handleRemoveRepo(match[1]);
  }
  return null;
}
