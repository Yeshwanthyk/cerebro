import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeAll, afterAll, describe, expect, it } from "bun:test";
import { getGitManager, isGitRepo, getRepoName, type GitManager } from "./index";

let tempDir: string;
let testRepoPath: string;
let git: GitManager;

// Helper to create a test git repo
async function createTestGitRepo(dir: string, name = "test-repo"): Promise<string> {
  const repoPath = join(dir, name);
  await Bun.$`mkdir -p ${repoPath}/src`.quiet();
  await Bun.$`git -C ${repoPath} init`.quiet();
  await Bun.$`git -C ${repoPath} config user.email "test@test.com"`.quiet();
  await Bun.$`git -C ${repoPath} config user.name "Test"`.quiet();

  // Create initial commit on main branch
  await Bun.$`git -C ${repoPath} checkout -b main`.quiet();
  writeFileSync(join(repoPath, "README.md"), "# Test Repo\n");
  writeFileSync(join(repoPath, "src/index.ts"), "console.log('hello');\n");
  await Bun.$`git -C ${repoPath} add .`.quiet();
  await Bun.$`git -C ${repoPath} commit -m "Initial commit"`.quiet();

  return repoPath;
}

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "cerebro-git-test-"));
  testRepoPath = await createTestGitRepo(tempDir);
  git = getGitManager(testRepoPath);
});

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

// =============================================================================
// Branch/Commit Info
// =============================================================================

describe("branch and commit info", () => {
  it("getCurrentBranch returns current branch name", async () => {
    const branch = await git.getCurrentBranch();
    expect(branch).toBe("main");
  });

  it("getCurrentCommit returns short hash (7 chars)", async () => {
    const commit = await git.getCurrentCommit();
    expect(commit.length).toBe(7);
    expect(/^[a-f0-9]+$/.test(commit)).toBe(true);
  });

  it("getDefaultBranch returns main for this repo", async () => {
    const defaultBranch = await git.getDefaultBranch();
    expect(defaultBranch).toBe("main");
  });

  it("getRemoteUrl returns undefined without remote", async () => {
    const remoteUrl = await git.getRemoteUrl();
    expect(remoteUrl).toBeUndefined();
  });
});

// =============================================================================
// Diff Operations
// =============================================================================

describe("diff operations", () => {
  describe("branch mode", () => {
    it("getDiff returns empty files when no changes", async () => {
      const diff = await git.getDiff({ baseBranch: "main", mode: "branch" });
      expect(diff.files).toEqual([]);
      expect(diff.branch).toBe("main");
      expect(diff.mode).toBe("branch");
    });

    it("getDiff returns files when on feature branch", async () => {
      // Create feature branch with changes
      await Bun.$`git -C ${testRepoPath} checkout -b feature-test`.quiet();
      writeFileSync(join(testRepoPath, "new-file.ts"), "export const x = 1;\n");
      await Bun.$`git -C ${testRepoPath} add .`.quiet();
      await Bun.$`git -C ${testRepoPath} commit -m "Add new file"`.quiet();

      const diff = await git.getDiff({ baseBranch: "main", mode: "branch" });
      expect(diff.files.length).toBe(1);
      expect(diff.files[0].path).toBe("new-file.ts");
      expect(diff.files[0].status).toBe("added");
      expect(diff.files[0].additions).toBeGreaterThan(0);

      // Cleanup
      await Bun.$`git -C ${testRepoPath} checkout main`.quiet();
      await Bun.$`git -C ${testRepoPath} branch -D feature-test`.quiet();
    });
  });

  describe("working mode", () => {
    it("getDiff returns empty when no working changes", async () => {
      const diff = await git.getDiff({ baseBranch: "main", mode: "working" });
      expect(diff.files).toEqual([]);
      expect(diff.mode).toBe("working");
    });

    it("getDiff returns modified files", async () => {
      // Modify a file
      writeFileSync(join(testRepoPath, "README.md"), "# Modified\n");

      const diff = await git.getDiff({ baseBranch: "main", mode: "working" });
      expect(diff.files.length).toBe(1);
      expect(diff.files[0].path).toBe("README.md");
      expect(diff.files[0].status).toBe("modified");

      // Restore
      await Bun.$`git -C ${testRepoPath} checkout -- README.md`.quiet();
    });

    it("getDiff returns untracked files", async () => {
      writeFileSync(join(testRepoPath, "untracked.txt"), "untracked content\n");

      const diff = await git.getDiff({ baseBranch: "main", mode: "working" });
      const untrackedFile = diff.files.find((f) => f.path === "untracked.txt");
      expect(untrackedFile).toBeDefined();
      expect(untrackedFile?.status).toBe("untracked");

      // Cleanup
      await Bun.$`rm ${join(testRepoPath, "untracked.txt")}`.quiet();
    });
  });

  describe("staged files in working mode", () => {
    it("getDiff returns staged files with staged flag", async () => {
      writeFileSync(join(testRepoPath, "staged.txt"), "staged content\n");
      await Bun.$`git -C ${testRepoPath} add staged.txt`.quiet();

      const diff = await git.getDiff({ baseBranch: "main", mode: "working" });
      expect(diff.files.length).toBe(1);
      expect(diff.files[0]?.path).toBe("staged.txt");
      expect(diff.files[0]?.status).toBe("added");
      expect(diff.files[0]?.staged).toBe(true);

      // Cleanup
      await Bun.$`git -C ${testRepoPath} reset HEAD staged.txt`.quiet();
      await Bun.$`rm ${join(testRepoPath, "staged.txt")}`.quiet();
    });

    it("getDiff returns unstaged files with staged=false", async () => {
      writeFileSync(join(testRepoPath, "README.md"), "# Modified unstaged\n");

      const diff = await git.getDiff({ baseBranch: "main", mode: "working" });
      const file = diff.files.find((f) => f.path === "README.md");
      expect(file).toBeDefined();
      expect(file?.staged).toBe(false);

      // Cleanup
      await Bun.$`git -C ${testRepoPath} checkout -- README.md`.quiet();
    });
  });
});

// =============================================================================
// File Diff (lazy loading)
// =============================================================================

describe("getFileDiff", () => {
  it("returns empty diff for non-existent file in branch mode", async () => {
    const fileDiff = await git.getFileDiff({
      baseBranch: "main",
      mode: "branch",
      filePath: "nonexistent.ts",
    });
    // Returns an empty diff object (no changes) rather than null
    expect(fileDiff?.patch).toBe("");
    expect(fileDiff?.additions).toBe(0);
    expect(fileDiff?.deletions).toBe(0);
  });

  it("returns file diff for modified file in working mode", async () => {
    writeFileSync(join(testRepoPath, "README.md"), "# Changed\n");

    const fileDiff = await git.getFileDiff({
      baseBranch: "main",
      mode: "working",
      filePath: "README.md",
    });
    expect(fileDiff).not.toBeNull();
    expect(fileDiff?.path).toBe("README.md");
    expect(fileDiff?.status).toBe("modified");
    expect(fileDiff?.patch).toContain("-# Test Repo");
    expect(fileDiff?.patch).toContain("+# Changed");

    // Restore
    await Bun.$`git -C ${testRepoPath} checkout -- README.md`.quiet();
  });

  it("returns null for unchanged file in working mode", async () => {
    const fileDiff = await git.getFileDiff({
      baseBranch: "main",
      mode: "working",
      filePath: "README.md",
    });
    expect(fileDiff).toBeNull();
  });
});

// =============================================================================
// Git Operations
// =============================================================================

describe("git operations", () => {
  it("stageFile stages a file", async () => {
    writeFileSync(join(testRepoPath, "to-stage.txt"), "content\n");

    await git.stageFile("to-stage.txt");

    const status = await git.status();
    expect(status.staged).toContain("to-stage.txt");

    // Cleanup
    await Bun.$`git -C ${testRepoPath} reset HEAD to-stage.txt`.quiet();
    await Bun.$`rm ${join(testRepoPath, "to-stage.txt")}`.quiet();
  });

  it("unstageFile unstages a file", async () => {
    writeFileSync(join(testRepoPath, "to-unstage.txt"), "content\n");
    await Bun.$`git -C ${testRepoPath} add to-unstage.txt`.quiet();

    await git.unstageFile("to-unstage.txt");

    const status = await git.status();
    expect(status.staged).not.toContain("to-unstage.txt");
    expect(status.not_added).toContain("to-unstage.txt");

    // Cleanup
    await Bun.$`rm ${join(testRepoPath, "to-unstage.txt")}`.quiet();
  });

  it("discardFile restores tracked file", async () => {
    writeFileSync(join(testRepoPath, "README.md"), "# Modified content\n");

    await git.discardFile("README.md");

    const content = await Bun.file(join(testRepoPath, "README.md")).text();
    expect(content).toBe("# Test Repo\n");
  });

  it("discardFile removes untracked file", async () => {
    const filePath = join(testRepoPath, "untracked-to-discard.txt");
    writeFileSync(filePath, "untracked\n");

    await git.discardFile("untracked-to-discard.txt");

    const exists = await Bun.file(filePath).exists();
    expect(exists).toBe(false);
  });

  it("commit creates a commit and returns hash", async () => {
    writeFileSync(join(testRepoPath, "commit-test.txt"), "for commit\n");
    await Bun.$`git -C ${testRepoPath} add commit-test.txt`.quiet();

    const hash = await git.commit("Test commit message");
    expect(hash).toBeDefined();
    expect(hash.length).toBeGreaterThan(0);

    // Verify commit was made
    const log = await Bun.$`git -C ${testRepoPath} log --oneline -1`.text();
    expect(log).toContain("Test commit message");
  });

  it("status returns git status", async () => {
    writeFileSync(join(testRepoPath, "new-file.txt"), "new\n");
    writeFileSync(join(testRepoPath, "README.md"), "# Changed again\n");

    const status = await git.status();
    expect(status.not_added).toContain("new-file.txt");
    expect(status.modified).toContain("README.md");

    // Cleanup
    await Bun.$`git -C ${testRepoPath} checkout -- README.md`.quiet();
    await Bun.$`rm ${join(testRepoPath, "new-file.txt")}`.quiet();
  });
});

// =============================================================================
// Utility Functions
// =============================================================================

describe("utility functions", () => {
  it("isGitRepo returns true for git directory", async () => {
    const result = await isGitRepo(testRepoPath);
    expect(result).toBe(true);
  });

  it("isGitRepo returns false for non-git directory", async () => {
    const nonGitDir = join(tempDir, "not-a-repo");
    await Bun.$`mkdir -p ${nonGitDir}`.quiet();

    const result = await isGitRepo(nonGitDir);
    expect(result).toBe(false);
  });

  it("isGitRepo returns false for non-existent path", async () => {
    const result = await isGitRepo("/nonexistent/path");
    expect(result).toBe(false);
  });

  it("getRepoName extracts basename from path", () => {
    expect(getRepoName("/path/to/my-repo")).toBe("my-repo");
    expect(getRepoName("/another/project")).toBe("project");
    expect(getRepoName("simple")).toBe("simple");
  });

  it("getGitManager caches instances by path", () => {
    const git1 = getGitManager(testRepoPath);
    const git2 = getGitManager(testRepoPath);
    expect(git1).toBe(git2); // Same instance
  });

  it("getGitManager returns different instances for different paths", async () => {
    const anotherRepo = await createTestGitRepo(tempDir, "another-repo");
    const git1 = getGitManager(testRepoPath);
    const git2 = getGitManager(anotherRepo);
    expect(git1).not.toBe(git2);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("edge cases", () => {
  it("handles files in subdirectories", async () => {
    writeFileSync(join(testRepoPath, "src/index.ts"), "// modified\n");

    const diff = await git.getDiff({ baseBranch: "main", mode: "working" });
    const file = diff.files.find((f) => f.path === "src/index.ts");
    expect(file).toBeDefined();
    expect(file?.status).toBe("modified");

    // Restore
    await Bun.$`git -C ${testRepoPath} checkout -- src/index.ts`.quiet();
  });

  it("handles deleted files in working mode", async () => {
    await Bun.$`rm ${join(testRepoPath, "README.md")}`.quiet();

    const diff = await git.getDiff({ baseBranch: "main", mode: "working" });
    const deleted = diff.files.find((f) => f.path === "README.md");
    expect(deleted).toBeDefined();
    expect(deleted?.status).toBe("deleted");

    // Restore
    await Bun.$`git -C ${testRepoPath} checkout -- README.md`.quiet();
  });

  it("diff response includes repo metadata", async () => {
    const diff = await git.getDiff({ baseBranch: "main", mode: "branch" });
    expect(diff.repo_path).toBe(testRepoPath);
    expect(diff.branch).toBe("main");
    expect(diff.commit).toBeDefined();
    expect(diff.base_branch).toBe("main");
  });
});
