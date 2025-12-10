import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "bun:test";

let originalHome: string | undefined;
let originalCwd: string;
let tempHome: string;
let configDir: string;

// Helpers loaded lazily so they pick up the temp HOME
let state: typeof import("../state");

beforeAll(async () => {
  originalHome = process.env["HOME"];
  originalCwd = process.cwd();

  tempHome = mkdtempSync(join(tmpdir(), "cerebro-test-"));
  configDir = join(tempHome, ".config", "cerebro");
  process.env["CEREBRO_CONFIG_DIR"] = configDir;
  process.env["HOME"] = tempHome;
  process.env["XDG_CONFIG_HOME"] = join(tempHome, ".config");

  // Ensure directories exist before module load
  mkdirSync(join(tempHome, ".config"), { recursive: true });

  state = await import("../state");
});

afterAll(() => {
  state.closeDb();
  if (configDir) {
    rmSync(configDir, { recursive: true, force: true });
  }
  process.env["HOME"] = originalHome;
  delete process.env["CEREBRO_CONFIG_DIR"];
  process.chdir(originalCwd);
});

beforeEach(() => {
  // Reset DB between tests
  state.closeDb();
  rmSync(configDir, { recursive: true, force: true });
  mkdirSync(configDir, { recursive: true });
  process.chdir(originalCwd);
});

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", "src/index.ts", ...args], {
    cwd: originalCwd,
    env: {
      ...process.env,
      HOME: tempHome,
      CEREBRO_CONFIG_DIR: configDir,
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

describe("comments CLI", () => {
  it("adds a comment", async () => {
    const repo = await state.addRepo("/tmp/test-repo", "test-repo", "main");
    await state.setCurrentRepo(repo.id);

    const result = await runCli([
      "comments",
      "add",
      "This is a test comment",
      "--repo",
      repo.id,
      "--file",
      "src/main.ts",
      "--line",
      "42",
      "--branch",
      "feature-x",
      "--commit",
      "abc1234",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Added comment:");

    const comments = await state.getComments(repo.id);
    expect(comments.length).toBe(1);
    expect(comments[0].text).toBe("This is a test comment");
    expect(comments[0].line_number).toBe(42);
    expect(comments[0].branch).toBe("feature-x");
  });

  it("requires --file for add", async () => {
    const repo = await state.addRepo("/tmp/test-repo2", "test-repo2", "main");

    const result = await runCli([
      "comments",
      "add",
      "Missing file",
      "--repo",
      repo.id,
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--file is required");
  });

  it("resolves a comment", async () => {
    const repo = await state.addRepo("/tmp/test-repo3", "test-repo3", "main");
    const comment = await state.addComment(repo.id, {
      file_path: "/tmp/test-repo3/src/foo.ts",
      text: "Needs review",
      branch: "main",
      commit: "abc123",
    });

    const result = await runCli([
      "comments",
      "resolve",
      comment.id,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Resolved comment: ${comment.id}`);

    const comments = await state.getComments(repo.id);
    expect(comments[0].resolved).toBe(true);
  });

  it("lists comments", async () => {
    const repo = await state.addRepo("/tmp/test-repo4", "test-repo4", "main");
    await state.addComment(repo.id, {
      file_path: "/tmp/test-repo4/src/bar.ts",
      line_number: 10,
      text: "Check this logic",
      branch: "main",
      commit: "def456",
    });

    const result = await runCli([
      "comments",
      "list",
      "--repo",
      repo.id,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Check this logic");
    expect(result.stdout).toContain("src/bar.ts:10");
  });

  it("replies to a comment using parent context", async () => {
    const repo = await state.addRepo("/tmp/test-repo5", "test-repo5", "main");
    await state.setCurrentRepo(repo.id);

    const parent = await state.addComment(repo.id, {
      file_path: "/tmp/test-repo5/src/parent.ts",
      line_number: 7,
      text: "Parent comment",
      branch: "feature/reply",
      commit: "abc987",
    });

    const result = await runCli([
      "comments",
      "reply",
      parent.id,
      "Child reply text",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Added reply:");

    const comments = await state.getComments(repo.id);
    const reply = comments.find((c) => c.parent_id === parent.id);
    expect(reply).toBeDefined();
    expect(reply?.text).toBe("Child reply text");
    expect(reply?.file_path).toBe("src/parent.ts");
    expect(reply?.line_number).toBe(7);
    expect(reply?.branch).toBe("feature/reply");
    expect(reply?.commit).toBe("abc987");
  });
});

describe("notes CLI", () => {
  it("adds a note", async () => {
    const repo = await state.addRepo("/tmp/note-repo", "note-repo", "main");

    const result = await runCli([
      "notes",
      "add",
      "This function handles auth",
      "--repo",
      repo.id,
      "--file",
      "src/auth.ts",
      "--line",
      "15",
      "--type",
      "explanation",
      "--author",
      "ai-agent",
      "--branch",
      "main",
      "--commit",
      "xyz789",
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Added note:");

    const notes = await state.getNotes(repo.id);
    expect(notes.length).toBe(1);
    expect(notes[0].text).toBe("This function handles auth");
    expect(notes[0].type).toBe("explanation");
    expect(notes[0].author).toBe("ai-agent");
  });

  it("requires --file and --line for add", async () => {
    const repo = await state.addRepo("/tmp/note-repo2", "note-repo2", "main");

    const result1 = await runCli([
      "notes",
      "add",
      "Missing file",
      "--repo",
      repo.id,
      "--line",
      "10",
    ]);
    expect(result1.exitCode).toBe(1);
    expect(result1.stderr).toContain("--file is required");

    const result2 = await runCli([
      "notes",
      "add",
      "Missing line",
      "--repo",
      repo.id,
      "--file",
      "src/x.ts",
    ]);
    expect(result2.exitCode).toBe(1);
    expect(result2.stderr).toContain("--line is required");
  });

  it("validates note type", async () => {
    const repo = await state.addRepo("/tmp/note-repo3", "note-repo3", "main");

    const result = await runCli([
      "notes",
      "add",
      "Bad type",
      "--repo",
      repo.id,
      "--file",
      "src/x.ts",
      "--line",
      "1",
      "--type",
      "invalid",
    ]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("--type must be one of");
  });

  it("dismisses a note", async () => {
    const repo = await state.addRepo("/tmp/note-repo4", "note-repo4", "main");
    const note = await state.addNote(repo.id, {
      file_path: "/tmp/note-repo4/src/foo.ts",
      line_number: 5,
      text: "Old explanation",
      branch: "main",
      commit: "abc",
      author: "user",
      type: "explanation",
    });

    const result = await runCli([
      "notes",
      "dismiss",
      note.id,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`Dismissed note: ${note.id}`);

    const notes = await state.getNotes(repo.id);
    expect(notes[0].dismissed).toBe(true);
  });

  it("lists notes", async () => {
    const repo = await state.addRepo("/tmp/note-repo5", "note-repo5", "main");
    await state.addNote(repo.id, {
      file_path: "/tmp/note-repo5/src/util.ts",
      line_number: 20,
      text: "Consider caching here",
      branch: "main",
      commit: "zzz",
      author: "reviewer",
      type: "suggestion",
    });

    const result = await runCli([
      "notes",
      "list",
      "--repo",
      repo.id,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Consider caching here");
    expect(result.stdout).toContain("src/util.ts:20");
    expect(result.stdout).toContain("suggestion");
  });
});
