import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "bun:test";

let originalHome: string | undefined;
let tempHome: string;
let configDir: string;

let state: typeof import("./index");

beforeAll(async () => {
  originalHome = process.env["HOME"];
  tempHome = mkdtempSync(join(tmpdir(), "cerebro-comments-test-"));
  configDir = join(tempHome, ".config", "cerebro");
  process.env["CEREBRO_CONFIG_DIR"] = configDir;
  process.env["HOME"] = tempHome;
  process.env["XDG_CONFIG_HOME"] = join(tempHome, ".config");
  mkdirSync(join(tempHome, ".config"), { recursive: true });
  state = await import("./index");
});

afterAll(() => {
  state.closeDb();
  rmSync(configDir, { recursive: true, force: true });
  process.env["HOME"] = originalHome;
  delete process.env["CEREBRO_CONFIG_DIR"];
});

beforeEach(() => {
  state.closeDb();
  rmSync(configDir, { recursive: true, force: true });
  mkdirSync(configDir, { recursive: true });
});

describe("comments state", () => {
  it("filters unresolved comments by branch when provided", async () => {
    const repo = await state.addRepo("/tmp/comments-repo", "comments", "main");

    await state.addComment(repo.id, {
      file_path: "/tmp/comments-repo/src/file1.ts",
      line_number: 10,
      text: "Needs refactor",
      branch: "feature",
      commit: "abcdef1",
    });

    const resolved = await state.addComment(repo.id, {
      file_path: "/tmp/comments-repo/src/file2.ts",
      line_number: 5,
      text: "Fix typo",
      branch: "feature",
      commit: "abcdef2",
    });
    await state.resolveComment(repo.id, resolved.id);

    // Comment on another branch
    await state.addComment(repo.id, {
      file_path: "/tmp/comments-repo/src/other.ts",
      line_number: 1,
      text: "Other branch",
      branch: "main",
      commit: "1234567",
    });

    const featureComments = await state.getComments(repo.id, "feature");
    expect(featureComments.length).toBe(1);
    expect(featureComments[0].text).toBe("Needs refactor");
    expect(featureComments[0].resolved).toBe(false);

    const allComments = await state.getComments(repo.id);
    expect(allComments.length).toBe(3);
  });
});
