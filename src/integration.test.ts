/**
 * Integration tests for end-to-end workflows and edge cases
 */
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "bun:test";
import { startServer, stopServer } from "./server";
import * as state from "./state";
import type { Repository, Comment, DiffResponse } from "./types";

type ApiResponse<T = unknown> = T & {
  error?: string;
  success?: boolean;
};

let tempHome: string;
let configDir: string;
let testRepoPath: string;
let baseUrl: string;
let port: number;

async function createTestGitRepo(dir: string, name = "test-repo"): Promise<string> {
  const repoPath = join(dir, name);
  await Bun.$`mkdir -p ${repoPath}/src`.quiet();
  await Bun.$`git -C ${repoPath} init`.quiet();
  await Bun.$`git -C ${repoPath} config user.email "test@test.com"`.quiet();
  await Bun.$`git -C ${repoPath} config user.name "Test"`.quiet();
  await Bun.$`git -C ${repoPath} checkout -b main`.quiet();
  writeFileSync(join(repoPath, "README.md"), "# Test Repo\n");
  writeFileSync(join(repoPath, "src/index.ts"), "console.log('hello');\n");
  await Bun.$`git -C ${repoPath} add .`.quiet();
  await Bun.$`git -C ${repoPath} commit -m "Initial commit"`.quiet();
  return repoPath;
}

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
  tempHome = mkdtempSync(join(tmpdir(), "cerebro-integration-test-"));
  configDir = join(tempHome, ".config", "cerebro");
  mkdirSync(configDir, { recursive: true });
  process.env["CEREBRO_CONFIG_DIR"] = configDir;
  testRepoPath = await createTestGitRepo(tempHome);
  port = 4000 + Math.floor(Math.random() * 1000);
  baseUrl = `http://localhost:${port}`;
  await startServer({ port });
});

afterAll(async () => {
  stopServer();
  state.closeDb();
  rmSync(tempHome, { recursive: true, force: true });
  delete process.env["CEREBRO_CONFIG_DIR"];
});

beforeEach(async () => {
  state.closeDb();
  rmSync(join(configDir, "cerebro.db"), { force: true });
  rmSync(join(configDir, "cerebro.db-wal"), { force: true });
  rmSync(join(configDir, "cerebro.db-shm"), { force: true });
});

// =============================================================================
// Full Workflow Tests
// =============================================================================

describe("full workflows", () => {
  it("complete review workflow: add repo → view diff → mark viewed → add comment → resolve", async () => {
    // 1. Add repository
    const addRes = await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });
    expect(addRes.status).toBe(200);
    await addRes.json(); // consume body

    // 2. Create a change to review
    writeFileSync(join(testRepoPath, "new-feature.ts"), "export const feature = true;\n");
    await Bun.$`git -C ${testRepoPath} add new-feature.ts`.quiet();
    await Bun.$`git -C ${testRepoPath} commit -m "Add feature"`.quiet();

    // 3. Get diff (on main, so branch diff is empty - use working for test)
    writeFileSync(join(testRepoPath, "another.ts"), "// another file\n");
    const diffRes = await api("/api/diff?mode=working");
    expect(diffRes.status).toBe(200);
    const diff = (await diffRes.json()) as DiffResponse;
    expect(diff.files.length).toBeGreaterThan(0);

    // 4. Mark file as viewed
    const markRes = await api("/api/mark-viewed", {
      method: "POST",
      body: { file_path: "another.ts" },
    });
    expect(markRes.status).toBe(200);

    // 5. Add a comment
    const commentRes = await api("/api/comments", {
      method: "POST",
      body: {
        file_path: "another.ts",
        line_number: 1,
        text: "Consider adding a description here",
      },
    });
    expect(commentRes.status).toBe(200);
    const comment = (await commentRes.json()) as Comment;

    // 6. Resolve the comment
    const resolveRes = await api("/api/comments/resolve", {
      method: "POST",
      body: { comment_id: comment.id, resolved_by: "reviewer" },
    });
    expect(resolveRes.status).toBe(200);

    // 7. Verify comment is resolved
    const commentsRes = await api("/api/comments");
    const comments = (await commentsRes.json()) as Comment[];
    // Should be empty since we filter by branch and resolved
    expect(comments.length).toBe(0);

    // Cleanup
    await Bun.$`rm ${join(testRepoPath, "another.ts")}`.quiet();
  });

  it("staging workflow: modify → stage → commit", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    // 1. Modify a file
    writeFileSync(join(testRepoPath, "README.md"), "# Updated README\n\nWith more content.\n");

    // 2. Verify it shows in working diff
    const workingRes = await api("/api/diff?mode=working");
    const workingDiff = (await workingRes.json()) as DiffResponse;
    expect(workingDiff.files.some((f) => f.path === "README.md")).toBe(true);

    // 3. Stage it
    await api("/api/stage", {
      method: "POST",
      body: { file_path: "README.md" },
    });

    // 4. Verify it shows as staged in working mode
    const workingRes2 = await api("/api/diff?mode=working");
    const workingDiff2 = (await workingRes2.json()) as DiffResponse;
    const stagedFile = workingDiff2.files.find((f) => f.path === "README.md");
    expect(stagedFile).toBeDefined();
    expect(stagedFile?.staged).toBe(true);

    // 5. Commit
    const commitRes = await api("/api/commit", {
      method: "POST",
      body: { message: "Update README" },
    });
    expect(commitRes.status).toBe(200);

    // 6. Working should now be empty (no changes)
    const workingRes3 = await api("/api/diff?mode=working");
    const workingDiff3 = (await workingRes3.json()) as DiffResponse;
    expect(workingDiff3.files.length).toBe(0);
  });

  it("multi-repo workflow: switch between repos", async () => {
    // Create second repo
    const repo2Path = await createTestGitRepo(tempHome, "second-repo");

    // Add both repos
    const res1 = await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });
    const repo1 = (await res1.json()) as Repository;

    const res2 = await api("/api/repos", {
      method: "POST",
      body: { path: repo2Path },
    });
    const repo2 = (await res2.json()) as Repository;

    // First repo should be current
    const listRes1 = await api("/api/repos");
    const list1 = (await listRes1.json()) as ApiResponse<{ repos: Repository[]; currentRepo: string }>;
    expect(list1.currentRepo).toBe(repo1.id);

    // Switch to second repo
    await api("/api/repos/current", {
      method: "POST",
      body: { id: repo2.id },
    });

    // Verify switch
    const listRes2 = await api("/api/repos");
    const list2 = (await listRes2.json()) as ApiResponse<{ repos: Repository[]; currentRepo: string }>;
    expect(list2.currentRepo).toBe(repo2.id);

    // Diff should work with explicit repo param
    const diffRes = await api(`/api/diff?repo=${repo1.id}&mode=branch`);
    expect(diffRes.status).toBe(200);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("edge cases", () => {
  it("handles unicode in file paths", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    // Create file with unicode name
    const unicodeFile = join(testRepoPath, "файл.txt");
    writeFileSync(unicodeFile, "Содержимое\n");

    const diffRes = await api("/api/diff?mode=working");
    const diff = (await diffRes.json()) as DiffResponse;
    const file = diff.files.find((f) => f.path.includes("файл"));
    expect(file).toBeDefined();

    // Cleanup
    await Bun.$`rm ${unicodeFile}`.quiet();
  });

  it("handles unicode in comments", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const commentRes = await api("/api/comments", {
      method: "POST",
      body: {
        file_path: "README.md",
        text: "这是一个评论 🎉 émojis работают",
      },
    });
    expect(commentRes.status).toBe(200);
    const comment = (await commentRes.json()) as Comment;
    expect(comment.text).toBe("这是一个评论 🎉 émojis работают");
  });

  it("handles spaces in repo path", async () => {
    const spacePath = join(tempHome, "repo with spaces");
    await Bun.$`mkdir -p "${spacePath}"`.quiet();
    await Bun.$`git -C "${spacePath}" init`.quiet();
    await Bun.$`git -C "${spacePath}" config user.email "test@test.com"`.quiet();
    await Bun.$`git -C "${spacePath}" config user.name "Test"`.quiet();
    writeFileSync(join(spacePath, "README.md"), "# Test\n");
    await Bun.$`git -C "${spacePath}" add .`.quiet();
    await Bun.$`git -C "${spacePath}" commit -m "Initial"`.quiet();

    const res = await api("/api/repos", {
      method: "POST",
      body: { path: spacePath },
    });
    expect(res.status).toBe(200);
    const repo = (await res.json()) as Repository;
    expect(repo.path).toBe(spacePath);
  });

  it("repo removal cleans all related data", async () => {
    const res = await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });
    const repo = (await res.json()) as Repository;

    // Add comment
    await api("/api/comments", {
      method: "POST",
      body: {
        file_path: "README.md",
        text: "Test comment",
      },
    });

    // Mark file viewed
    await api("/api/mark-viewed", {
      method: "POST",
      body: { file_path: "README.md" },
    });

    // Remove repo
    const deleteRes = await api(`/api/repos/${repo.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(200);

    // Verify data is gone (need to add repo back to check)
    const res2 = await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });
    const repo2 = (await res2.json()) as Repository;
    expect(repo2.id).not.toBe(repo.id); // New ID since it's a fresh add

    // Comments should be empty
    const commentsRes = await api("/api/comments");
    const comments = (await commentsRes.json()) as Comment[];
    expect(comments.length).toBe(0);
  });

  it("handles malformed JSON gracefully", async () => {
    const res = await fetch(`${baseUrl}/api/repos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not valid json",
    });
    expect(res.status).toBe(500);
  });

  it("handles empty request body", async () => {
    const res = await fetch(`${baseUrl}/api/repos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "",
    });
    expect(res.status).toBe(500);
  });

  it("handles concurrent requests", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    // Fire 10 concurrent comment creations
    const promises = Array.from({ length: 10 }, (_, i) =>
      api("/api/comments", {
        method: "POST",
        body: {
          file_path: `file${i}.ts`,
          text: `Comment ${i}`,
        },
      })
    );

    const results = await Promise.all(promises);
    
    // All should succeed
    for (const res of results) {
      expect(res.status).toBe(200);
    }

    // All comments should be saved
    const commentsRes = await api("/api/comments");
    const comments = (await commentsRes.json()) as Comment[];
    expect(comments.length).toBe(10);
  });

  it("handles very long file paths", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const longPath = "src/" + "nested/".repeat(20) + "file.ts";
    
    const commentRes = await api("/api/comments", {
      method: "POST",
      body: {
        file_path: longPath,
        text: "Comment on deeply nested file",
      },
    });
    expect(commentRes.status).toBe(200);
    const comment = (await commentRes.json()) as Comment;
    expect(comment.file_path).toBe(longPath);
  });

  it("handles special characters in comment text", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    const specialText = `Code: \`const x = 1;\`
      
      SQL: SELECT * FROM users WHERE name = 'O\\'Brien';
      
      HTML: <script>alert("xss")</script>
      
      Newlines: line1\nline2\r\nline3`;

    const commentRes = await api("/api/comments", {
      method: "POST",
      body: {
        file_path: "test.ts",
        text: specialText,
      },
    });
    expect(commentRes.status).toBe(200);
    const comment = (await commentRes.json()) as Comment;
    expect(comment.text).toBe(specialText);
  });
});

// =============================================================================
// Error Recovery
// =============================================================================

describe("error recovery", () => {
  it("recovers when repo path becomes invalid", async () => {
    // Create a temporary repo
    const tempRepo = await createTestGitRepo(tempHome, "temp-repo");
    
    const res = await api("/api/repos", {
      method: "POST",
      body: { path: tempRepo },
    });
    expect(res.status).toBe(200);

    // Delete the repo directory
    rmSync(tempRepo, { recursive: true, force: true });

    // List repos should not crash and should filter out invalid
    const listRes = await api("/api/repos");
    expect(listRes.status).toBe(200);
    const data = (await listRes.json()) as ApiResponse<{ repos: Repository[] }>;
    // The invalid repo should be removed
    expect(data.repos.some((r) => r.path === tempRepo)).toBe(false);
  });

  it("handles diff request when no files changed", async () => {
    await api("/api/repos", {
      method: "POST",
      body: { path: testRepoPath },
    });

    // All modes should return empty arrays gracefully
    for (const mode of ["branch", "working"]) {
      const res = await api(`/api/diff?mode=${mode}`);
      expect(res.status).toBe(200);
      const diff = (await res.json()) as DiffResponse;
      expect(Array.isArray(diff.files)).toBe(true);
    }
  });
});
