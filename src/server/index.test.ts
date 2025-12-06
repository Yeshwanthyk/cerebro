import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "bun:test";
import { startServer, stopServer } from "./index";
import * as state from "../state";
import type { Repository, Comment, DiffResponse } from "../types";

// Type for API responses
type ApiResponse<T = unknown> = T & {
  error?: string;
  success?: boolean;
};

let tempHome: string;
let configDir: string;
let testRepoPath: string;
let baseUrl: string;
let port: number;

// Helper to create a test git repo
async function createTestGitRepo(dir: string, name = "test-repo"): Promise<string> {
  const repoPath = join(dir, name);
  await Bun.$`mkdir -p ${repoPath}`.quiet();
  await Bun.$`git -C ${repoPath} init`.quiet();
  await Bun.$`git -C ${repoPath} config user.email "test@test.com"`.quiet();
  await Bun.$`git -C ${repoPath} config user.name "Test"`.quiet();

  // Create initial commit
  writeFileSync(join(repoPath, "README.md"), "# Test Repo\n");
  await Bun.$`git -C ${repoPath} add .`.quiet();
  await Bun.$`git -C ${repoPath} commit -m "Initial commit"`.quiet();

  return repoPath;
}

// Helper for making API requests
async function api(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const { method = "GET", body } = options;
  const url = `${baseUrl}${path}`;

  const fetchOptions: RequestInit = { method };
  if (body) {
    fetchOptions.body = JSON.stringify(body);
    fetchOptions.headers = { "Content-Type": "application/json" };
  }

  return fetch(url, fetchOptions);
}

beforeAll(async () => {
  // Setup temp directories
  tempHome = mkdtempSync(join(tmpdir(), "cerebro-server-test-"));
  configDir = join(tempHome, ".config", "cerebro");
  mkdirSync(configDir, { recursive: true });
  process.env["CEREBRO_CONFIG_DIR"] = configDir;

  // Create test git repo
  testRepoPath = await createTestGitRepo(tempHome);

  // Find available port
  port = 3030 + Math.floor(Math.random() * 1000);
  baseUrl = `http://localhost:${port}`;

  // Start server
  await startServer({ port });
});

afterAll(async () => {
  stopServer();
  state.closeDb();
  rmSync(tempHome, { recursive: true, force: true });
  delete process.env["CEREBRO_CONFIG_DIR"];
});

beforeEach(async () => {
  // Reset DB between tests
  state.closeDb();
  rmSync(join(configDir, "cerebro.db"), { force: true });
  rmSync(join(configDir, "cerebro.db-wal"), { force: true });
  rmSync(join(configDir, "cerebro.db-shm"), { force: true });
});

// =============================================================================
// Health & Basic
// =============================================================================

describe("health", () => {
  it("GET /api/health returns 200 with status ok", async () => {
    const res = await api("/api/health");
    expect(res.status).toBe(200);
    const data = (await res.json()) as ApiResponse<{ status: string }>;
    expect(data.status).toBe("ok");
  });

  it("OPTIONS requests return CORS headers", async () => {
    const res = await api("/api/repos", { method: "OPTIONS" });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("GET");
  });

  it("unknown API routes return 404", async () => {
    const res = await api("/api/unknown-route");
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// Repos API
// =============================================================================

describe("repos API", () => {
  it("GET /api/repos returns empty initially", async () => {
    const res = await api("/api/repos");
    expect(res.status).toBe(200);
    const data = (await res.json()) as ApiResponse<{ repos: Repository[]; currentRepo?: string }>;
    expect(data.repos).toEqual([]);
    expect(data.currentRepo).toBeUndefined();
  });

  it("POST /api/repos adds valid repo", async () => {
    const res = await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });
    expect(res.status).toBe(200);
    const repo = (await res.json()) as Repository;
    expect(repo.id).toBeDefined();
    expect(repo.path).toBe(testRepoPath);
    expect(repo.name).toBe("test-repo");
    expect(repo.baseBranch).toBeDefined();
  });

  it("POST /api/repos rejects non-git directory", async () => {
    const nonGitPath = join(tempHome, "not-a-repo");
    mkdirSync(nonGitPath, { recursive: true });

    const res = await api("/api/repos", {
      method: "POST",
      body: { path: nonGitPath },
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as ApiResponse;
    expect(data.error).toBe("Not a git repository");
  });

  it("POST /api/repos rejects missing path", async () => {
    const res = await api("/api/repos", {
      method: "POST",
      body: {},
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as ApiResponse<{ details?: Array<{ path: string; message: string }> }>;
    expect(data.error).toBe("Validation failed");
    expect(data.details).toBeDefined();
    expect(data.details!.length).toBeGreaterThan(0);
  });

  it("POST /api/repos returns existing for duplicate path", async () => {
    // Add first time
    const res1 = await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });
    const repo1 = (await res1.json()) as Repository;

    // Add again
    const res2 = await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });
    const repo2 = (await res2.json()) as Repository;

    expect(repo2.id).toBe(repo1.id);
  });

  it("GET /api/repos returns added repos", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const res = await api("/api/repos");
    const data = (await res.json()) as ApiResponse<{ repos: Repository[]; currentRepo?: string }>;
    expect(data.repos.length).toBe(1);
    expect(data.repos[0].path).toBe(testRepoPath);
    expect(data.currentRepo).toBe(data.repos[0].id);
  });

  it("DELETE /api/repos/:id removes repo", async () => {
    const addRes = await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });
    const repo = (await addRes.json()) as Repository;

    const deleteRes = await api(`/api/repos/${repo.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(200);

    const listRes = await api("/api/repos");
    const data = (await listRes.json()) as ApiResponse<{ repos: Repository[] }>;
    expect(data.repos.length).toBe(0);
  });

  it("DELETE /api/repos/:id returns 404 for unknown", async () => {
    const res = await api("/api/repos/nonexistent-id", { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("POST /api/repos/current sets current repo", async () => {
    const addRes = await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });
    const repo = (await addRes.json()) as Repository;

    const res = await api("/api/repos/current", {
      method: "POST",
      body: { id: repo.id },
    });
    expect(res.status).toBe(200);
  });

  it("POST /api/repos/current returns 404 for unknown", async () => {
    const res = await api("/api/repos/current", {
      method: "POST",
      body: { id: "nonexistent-id" },
    });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// Diff API
// =============================================================================

describe("diff API", () => {
  it("GET /api/diff returns 400 without repo", async () => {
    const res = await api("/api/diff");
    expect(res.status).toBe(400);
    const data = (await res.json()) as ApiResponse;
    expect(data.error).toBe("No repository selected");
  });

  it("GET /api/diff returns diff for repo", async () => {
    // Add repo first
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const res = await api("/api/diff?mode=branch");
    expect(res.status).toBe(200);
    const data = (await res.json()) as DiffResponse;
    expect(data.files).toBeDefined();
    expect(data.branch).toBeDefined();
    expect(data.commit).toBeDefined();
    expect(data.mode).toBe("branch");
  });

  it("GET /api/diff supports mode=working", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const res = await api("/api/diff?mode=working");
    expect(res.status).toBe(200);
    const data = (await res.json()) as DiffResponse;
    expect(data.mode).toBe("working");
  });

  it("GET /api/diff working mode includes staged files with flag", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    // Stage a file
    writeFileSync(join(testRepoPath, "staged-test.txt"), "staged\n");
    await Bun.$`git -C ${testRepoPath} add staged-test.txt`.quiet();

    const res = await api("/api/diff?mode=working");
    expect(res.status).toBe(200);
    const data = (await res.json()) as DiffResponse;
    expect(data.mode).toBe("working");
    
    const stagedFile = data.files.find((f) => f.path === "staged-test.txt");
    expect(stagedFile?.staged).toBe(true);

    // Cleanup
    await Bun.$`git -C ${testRepoPath} reset HEAD staged-test.txt`.quiet();
    await Bun.$`rm ${join(testRepoPath, "staged-test.txt")}`.quiet();
  });

  it("GET /api/file-diff returns 400 without repo", async () => {
    const res = await api("/api/file-diff?file=README.md");
    expect(res.status).toBe(400);
  });

  it("GET /api/file-diff returns 400 without file param", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const res = await api("/api/file-diff");
    expect(res.status).toBe(400);
    const data = (await res.json()) as ApiResponse;
    expect(data.error).toBe("File path required");
  });
});

// =============================================================================
// Viewed Files API
// =============================================================================

describe("viewed files API", () => {
  it("POST /api/mark-viewed returns 400 without repo", async () => {
    const res = await api("/api/mark-viewed", {
      method: "POST",
      body: { file_path: "test.ts" },
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/mark-viewed marks file as viewed", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const res = await api("/api/mark-viewed", {
      method: "POST",
      body: { file_path: "README.md" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as ApiResponse;
    expect(data.success).toBe(true);
  });

  it("POST /api/unmark-viewed unmarks file", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    // Mark first
    await api("/api/mark-viewed", {
      method: "POST",
      body: { file_path: "README.md" },
    });

    // Unmark
    const res = await api("/api/unmark-viewed", {
      method: "POST",
      body: { file_path: "README.md" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as ApiResponse;
    expect(data.success).toBe(true);
  });
});

// =============================================================================
// Comments API
// =============================================================================

describe("comments API", () => {
  it("GET /api/comments returns 400 without repo", async () => {
    const res = await api("/api/comments");
    expect(res.status).toBe(400);
  });

  it("GET /api/comments returns empty array initially", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const res = await api("/api/comments");
    expect(res.status).toBe(200);
    const data = (await res.json()) as Comment[];
    expect(data).toEqual([]);
  });

  it("POST /api/comments creates comment", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const res = await api("/api/comments", {
      method: "POST",
      body: {
        file_path: "README.md",
        line_number: 1,
        text: "Test comment",
      },
    });
    expect(res.status).toBe(200);
    const comment = (await res.json()) as Comment;
    expect(comment.id).toBeDefined();
    expect(comment.file_path).toBe("README.md");
    expect(comment.line_number).toBe(1);
    expect(comment.text).toBe("Test comment");
    expect(comment.resolved).toBe(false);
  });

  it("POST /api/comments/resolve resolves comment", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    // Create comment
    const createRes = await api("/api/comments", {
      method: "POST",
      body: {
        file_path: "README.md",
        text: "To resolve",
      },
    });
    const comment = (await createRes.json()) as Comment;

    // Resolve it
    const res = await api("/api/comments/resolve", {
      method: "POST",
      body: { comment_id: comment.id, resolved_by: "tester" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as ApiResponse;
    expect(data.success).toBe(true);
  });

  it("POST /api/comments/resolve returns 404 for unknown", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const res = await api("/api/comments/resolve", {
      method: "POST",
      body: { comment_id: "nonexistent-id" },
    });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// Notes API
// =============================================================================

describe("notes API", () => {
  it("GET /api/notes returns 400 without repo", async () => {
    const res = await api("/api/notes");
    expect(res.status).toBe(400);
  });

  it("GET /api/notes returns empty array initially", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const res = await api("/api/notes");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("POST /api/notes/dismiss returns 404 for unknown", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const res = await api("/api/notes/dismiss", {
      method: "POST",
      body: { note_id: "nonexistent-id" },
    });
    expect(res.status).toBe(404);
  });
});

// =============================================================================
// Git Operations API
// =============================================================================

describe("git operations API", () => {
  it("POST /api/stage returns 400 without repo", async () => {
    const res = await api("/api/stage", {
      method: "POST",
      body: { file_path: "test.ts" },
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/unstage returns 400 without repo", async () => {
    const res = await api("/api/unstage", {
      method: "POST",
      body: { file_path: "test.ts" },
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/discard returns 400 without repo", async () => {
    const res = await api("/api/discard", {
      method: "POST",
      body: { file_path: "test.ts" },
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/commit returns 400 without repo", async () => {
    const res = await api("/api/commit", {
      method: "POST",
      body: { message: "Test commit" },
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/commit returns 400 without message", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const res = await api("/api/commit", {
      method: "POST",
      body: {},
    });
    expect(res.status).toBe(400);
    const data = (await res.json()) as ApiResponse<{ details?: Array<{ path: string; message: string }> }>;
    expect(data.error).toBe("Validation failed");
    expect(data.details).toBeDefined();
    expect(data.details!.length).toBeGreaterThan(0);
  });

  it("POST /api/stage stages a modified file", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    // Modify a file
    writeFileSync(join(testRepoPath, "README.md"), "# Modified\n");

    const res = await api("/api/stage", {
      method: "POST",
      body: { file_path: "README.md" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as ApiResponse;
    expect(data.success).toBe(true);

    // Restore the file for other tests
    await Bun.$`git -C ${testRepoPath} checkout -- README.md`.quiet();
  });

  it("POST /api/commit creates a commit", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    // Create and stage a new file
    writeFileSync(join(testRepoPath, "new-file.txt"), "New content\n");
    await Bun.$`git -C ${testRepoPath} add new-file.txt`.quiet();

    const res = await api("/api/commit", {
      method: "POST",
      body: { message: "Add new file" },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as ApiResponse<{ commit: string }>;
    expect(data.commit).toBeDefined();
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("edge cases", () => {
  it("API returns CORS headers on all responses", async () => {
    const res = await api("/api/health");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("handles repo query parameter", async () => {
    const addRes = await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });
    const repo = (await addRes.json()) as Repository;

    // Use explicit repo ID in query
    const res = await api(`/api/diff?repo=${repo.id}&mode=branch`);
    expect(res.status).toBe(200);
  });

  it("returns 400 when repo query param is invalid", async () => {
    const res = await api("/api/diff?repo=invalid-id");
    expect(res.status).toBe(400);
  });
});
