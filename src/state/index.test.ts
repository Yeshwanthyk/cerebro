import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "bun:test";
import * as state from "./index";

let tempHome: string;
let configDir: string;

beforeAll(() => {
  tempHome = mkdtempSync(join(tmpdir(), "cerebro-state-test-"));
  configDir = join(tempHome, ".config", "cerebro");
  mkdirSync(configDir, { recursive: true });
  process.env["CEREBRO_CONFIG_DIR"] = configDir;
});

afterAll(() => {
  state.closeDb();
  rmSync(tempHome, { recursive: true, force: true });
  delete process.env["CEREBRO_CONFIG_DIR"];
});

beforeEach(() => {
  // Reset DB between tests
  state.closeDb();
  rmSync(configDir, { recursive: true, force: true });
  mkdirSync(configDir, { recursive: true });
});

// =============================================================================
// Config Tests
// =============================================================================

describe("config", () => {
  it("getConfig returns defaults when file missing", async () => {
    const config = await state.getConfig();
    expect(config).toEqual({ defaultPort: 3030 });
  });

  it("getConfig returns saved values", async () => {
    await state.saveConfig({ defaultPort: 8080 });
    const config = await state.getConfig();
    expect(config.defaultPort).toBe(8080);
  });

  it("saveConfig creates config file", async () => {
    await state.saveConfig({ defaultPort: 9000 });
    const file = Bun.file(join(configDir, "config.json"));
    expect(await file.exists()).toBe(true);
  });
});

// =============================================================================
// Repository Tests
// =============================================================================

describe("repos", () => {
  it("addRepo creates new repository", async () => {
    const repo = await state.addRepo("/tmp/test-repo", "test-repo", "main");
    expect(repo.id).toBeDefined();
    expect(repo.path).toBe("/tmp/test-repo");
    expect(repo.name).toBe("test-repo");
    expect(repo.baseBranch).toBe("main");
    expect(repo.addedAt).toBeGreaterThan(0);
  });

  it("addRepo returns existing repo if path matches", async () => {
    const repo1 = await state.addRepo("/tmp/test-repo", "test-repo", "main");
    const repo2 = await state.addRepo("/tmp/test-repo", "different-name", "develop");
    expect(repo2.id).toBe(repo1.id);
    expect(repo2.name).toBe("test-repo"); // Original name preserved
  });

  it("addRepo sets first repo as current", async () => {
    const repo = await state.addRepo("/tmp/first-repo", "first", "main");
    const current = await state.getCurrentRepo();
    expect(current?.id).toBe(repo.id);
  });

  it("addRepo does not change current for subsequent repos", async () => {
    const repo1 = await state.addRepo("/tmp/first-repo", "first", "main");
    await state.addRepo("/tmp/second-repo", "second", "main");
    const current = await state.getCurrentRepo();
    expect(current?.id).toBe(repo1.id);
  });

  it("getRepo returns undefined for unknown ID", async () => {
    const repo = await state.getRepo("nonexistent-id");
    expect(repo).toBeUndefined();
  });

  it("getRepoByPath returns repo by absolute path", async () => {
    const repo = await state.addRepo("/tmp/path-repo", "path-repo", "main");
    const found = await state.getRepoByPath("/tmp/path-repo");
    expect(found?.id).toBe(repo.id);
  });

  it("getRepoByPath returns undefined for unknown path", async () => {
    const found = await state.getRepoByPath("/nonexistent/path");
    expect(found).toBeUndefined();
  });

  it("getRepos returns all repos sorted by addedAt DESC", async () => {
    await state.addRepo("/tmp/repo-a", "repo-a", "main");
    await Bun.sleep(10); // Ensure different timestamps
    await state.addRepo("/tmp/repo-b", "repo-b", "main");
    
    const repos = await state.getRepos();
    expect(repos.length).toBe(2);
    expect(repos[0].name).toBe("repo-b"); // Most recent first
    expect(repos[1].name).toBe("repo-a");
  });

  it("getRepos returns empty array when no repos", async () => {
    const repos = await state.getRepos();
    expect(repos).toEqual([]);
  });

  it("removeRepo deletes repo", async () => {
    const repo = await state.addRepo("/tmp/to-remove", "to-remove", "main");
    const success = await state.removeRepo(repo.id);
    expect(success).toBe(true);
    
    const found = await state.getRepo(repo.id);
    expect(found).toBeUndefined();
  });

  it("removeRepo cascades to comments", async () => {
    const repo = await state.addRepo("/tmp/cascade-repo", "cascade", "main");
    await state.addComment(repo.id, {
      file_path: "test.ts",
      text: "test comment",
      branch: "main",
      commit: "abc123",
    });
    
    await state.removeRepo(repo.id);
    const comments = await state.getComments(repo.id);
    expect(comments.length).toBe(0);
  });

  it("removeRepo updates current repo to next available", async () => {
    const repo1 = await state.addRepo("/tmp/repo-1", "repo-1", "main");
    const repo2 = await state.addRepo("/tmp/repo-2", "repo-2", "main");
    await state.setCurrentRepo(repo1.id);
    
    await state.removeRepo(repo1.id);
    const current = await state.getCurrentRepo();
    expect(current?.id).toBe(repo2.id);
  });

  it("removeRepo clears current repo when last removed", async () => {
    const repo = await state.addRepo("/tmp/only-repo", "only", "main");
    await state.removeRepo(repo.id);
    const current = await state.getCurrentRepo();
    expect(current).toBeUndefined();
  });

  it("removeRepo returns false for unknown ID", async () => {
    const success = await state.removeRepo("nonexistent-id");
    expect(success).toBe(false);
  });

  it("setCurrentRepo updates current", async () => {
    const repo1 = await state.addRepo("/tmp/repo-1", "repo-1", "main");
    const repo2 = await state.addRepo("/tmp/repo-2", "repo-2", "main");
    
    await state.setCurrentRepo(repo2.id);
    const current = await state.getCurrentRepo();
    expect(current?.id).toBe(repo2.id);
  });

  it("setCurrentRepo with null clears current", async () => {
    await state.addRepo("/tmp/repo-1", "repo-1", "main");
    await state.setCurrentRepo(null);
    
    const reposState = await state.getReposState();
    expect(reposState.currentRepo).toBeUndefined();
  });

  it("setCurrentRepo returns false for unknown ID", async () => {
    const success = await state.setCurrentRepo("nonexistent-id");
    expect(success).toBe(false);
  });

  it("getCurrentRepo returns undefined when no repos", async () => {
    const current = await state.getCurrentRepo();
    expect(current).toBeUndefined();
  });

  it("updateRepo updates baseBranch", async () => {
    const repo = await state.addRepo("/tmp/update-repo", "update", "main");
    await state.updateRepo(repo.id, { baseBranch: "develop" });
    
    const updated = await state.getRepo(repo.id);
    expect(updated?.baseBranch).toBe("develop");
  });

  it("updateRepo updates name", async () => {
    const repo = await state.addRepo("/tmp/update-repo", "old-name", "main");
    await state.updateRepo(repo.id, { name: "new-name" });
    
    const updated = await state.getRepo(repo.id);
    expect(updated?.name).toBe("new-name");
  });

  it("updateRepo returns false for unknown ID", async () => {
    const success = await state.updateRepo("nonexistent-id", { name: "test" });
    expect(success).toBe(false);
  });
});

// =============================================================================
// Viewed Files Tests
// =============================================================================

describe("viewed files", () => {
  it("getViewedFiles returns empty object initially", async () => {
    const repo = await state.addRepo("/tmp/viewed-repo", "viewed", "main");
    const viewed = await state.getViewedFiles(repo.id, "main", "abc123");
    expect(viewed).toEqual({});
  });

  it("setFileViewed marks file as viewed", async () => {
    const repo = await state.addRepo("/tmp/viewed-repo", "viewed", "main");
    await state.setFileViewed(repo.id, "main", "abc123", "src/file.ts", true);
    
    const viewed = await state.getViewedFiles(repo.id, "main", "abc123");
    expect(viewed["src/file.ts"]).toBe(true);
  });

  it("setFileViewed with false removes viewed status", async () => {
    const repo = await state.addRepo("/tmp/viewed-repo", "viewed", "main");
    await state.setFileViewed(repo.id, "main", "abc123", "src/file.ts", true);
    await state.setFileViewed(repo.id, "main", "abc123", "src/file.ts", false);
    
    const viewed = await state.getViewedFiles(repo.id, "main", "abc123");
    expect(viewed["src/file.ts"]).toBeUndefined();
  });

  it("viewed files are scoped to branch", async () => {
    const repo = await state.addRepo("/tmp/viewed-repo", "viewed", "main");
    await state.setFileViewed(repo.id, "feature", "abc123", "src/file.ts", true);
    
    const mainViewed = await state.getViewedFiles(repo.id, "main", "abc123");
    const featureViewed = await state.getViewedFiles(repo.id, "feature", "abc123");
    
    expect(mainViewed["src/file.ts"]).toBeUndefined();
    expect(featureViewed["src/file.ts"]).toBe(true);
  });

  it("viewed files are scoped to commit", async () => {
    const repo = await state.addRepo("/tmp/viewed-repo", "viewed", "main");
    await state.setFileViewed(repo.id, "main", "abc123", "src/file.ts", true);
    
    const commit1Viewed = await state.getViewedFiles(repo.id, "main", "abc123");
    const commit2Viewed = await state.getViewedFiles(repo.id, "main", "def456");
    
    expect(commit1Viewed["src/file.ts"]).toBe(true);
    expect(commit2Viewed["src/file.ts"]).toBeUndefined();
  });

  it("viewed files are scoped to repo", async () => {
    const repo1 = await state.addRepo("/tmp/repo-1", "repo-1", "main");
    const repo2 = await state.addRepo("/tmp/repo-2", "repo-2", "main");
    
    await state.setFileViewed(repo1.id, "main", "abc123", "src/file.ts", true);
    
    const repo1Viewed = await state.getViewedFiles(repo1.id, "main", "abc123");
    const repo2Viewed = await state.getViewedFiles(repo2.id, "main", "abc123");
    
    expect(repo1Viewed["src/file.ts"]).toBe(true);
    expect(repo2Viewed["src/file.ts"]).toBeUndefined();
  });
});

// =============================================================================
// Comments Tests
// =============================================================================

describe("comments", () => {
  it("addComment creates comment with generated ID", async () => {
    const repo = await state.addRepo("/tmp/comments-repo", "comments", "main");
    const comment = await state.addComment(repo.id, {
      file_path: "src/file.ts",
      line_number: 10,
      text: "Test comment",
      branch: "main",
      commit: "abc123",
    });
    
    expect(comment.id).toBeDefined();
    expect(comment.file_path).toBe("src/file.ts");
    expect(comment.line_number).toBe(10);
    expect(comment.text).toBe("Test comment");
    expect(comment.resolved).toBe(false);
  });

  it("addComment sets timestamp automatically", async () => {
    const repo = await state.addRepo("/tmp/comments-repo", "comments", "main");
    const before = Date.now();
    const comment = await state.addComment(repo.id, {
      file_path: "src/file.ts",
      text: "Test comment",
      branch: "main",
      commit: "abc123",
    });
    const after = Date.now();
    
    expect(comment.timestamp).toBeGreaterThanOrEqual(before);
    expect(comment.timestamp).toBeLessThanOrEqual(after);
  });

  it("addComment without line_number works", async () => {
    const repo = await state.addRepo("/tmp/comments-repo", "comments", "main");
    const comment = await state.addComment(repo.id, {
      file_path: "src/file.ts",
      text: "File-level comment",
      branch: "main",
      commit: "abc123",
    });
    
    expect(comment.line_number).toBeUndefined();
  });

  it("getComments returns all for repo without branch filter", async () => {
    const repo = await state.addRepo("/tmp/comments-repo", "comments", "main");
    
    await state.addComment(repo.id, {
      file_path: "src/a.ts",
      text: "Comment 1",
      branch: "main",
      commit: "abc123",
    });
    
    const comment2 = await state.addComment(repo.id, {
      file_path: "src/b.ts",
      text: "Comment 2",
      branch: "feature",
      commit: "def456",
    });
    await state.resolveComment(repo.id, comment2.id);
    
    const allComments = await state.getComments(repo.id);
    expect(allComments.length).toBe(2);
  });

  it("getComments filters by branch (unresolved only)", async () => {
    const repo = await state.addRepo("/tmp/comments-repo", "comments", "main");
    
    await state.addComment(repo.id, {
      file_path: "src/a.ts",
      text: "Unresolved on feature",
      branch: "feature",
      commit: "abc123",
    });
    
    const resolved = await state.addComment(repo.id, {
      file_path: "src/b.ts",
      text: "Resolved on feature",
      branch: "feature",
      commit: "abc123",
    });
    await state.resolveComment(repo.id, resolved.id);
    
    await state.addComment(repo.id, {
      file_path: "src/c.ts",
      text: "On main",
      branch: "main",
      commit: "def456",
    });
    
    const featureComments = await state.getComments(repo.id, "feature");
    expect(featureComments.length).toBe(1);
    expect(featureComments[0].text).toBe("Unresolved on feature");
  });

  it("resolveComment marks as resolved", async () => {
    const repo = await state.addRepo("/tmp/comments-repo", "comments", "main");
    const comment = await state.addComment(repo.id, {
      file_path: "src/file.ts",
      text: "To resolve",
      branch: "main",
      commit: "abc123",
    });
    
    await state.resolveComment(repo.id, comment.id, "reviewer");
    
    const comments = await state.getComments(repo.id);
    expect(comments[0].resolved).toBe(true);
    expect(comments[0].resolved_by).toBe("reviewer");
    expect(comments[0].resolved_at).toBeGreaterThan(0);
  });

  it("resolveComment returns false for unknown ID", async () => {
    const repo = await state.addRepo("/tmp/comments-repo", "comments", "main");
    const success = await state.resolveComment(repo.id, "nonexistent-id");
    expect(success).toBe(false);
  });

  it("resolveComment returns false for wrong repo", async () => {
    const repo1 = await state.addRepo("/tmp/repo-1", "repo-1", "main");
    const repo2 = await state.addRepo("/tmp/repo-2", "repo-2", "main");
    
    const comment = await state.addComment(repo1.id, {
      file_path: "src/file.ts",
      text: "Comment in repo1",
      branch: "main",
      commit: "abc123",
    });
    
    const success = await state.resolveComment(repo2.id, comment.id);
    expect(success).toBe(false);
  });
});

// =============================================================================
// Notes Tests
// =============================================================================

describe("notes", () => {
  it("addNote creates note with generated ID", async () => {
    const repo = await state.addRepo("/tmp/notes-repo", "notes", "main");
    const note = await state.addNote(repo.id, {
      file_path: "src/file.ts",
      line_number: 10,
      text: "Explanation of this function",
      branch: "main",
      commit: "abc123",
      author: "AI",
      type: "explanation",
    });
    
    expect(note.id).toBeDefined();
    expect(note.file_path).toBe("src/file.ts");
    expect(note.line_number).toBe(10);
    expect(note.text).toBe("Explanation of this function");
    expect(note.author).toBe("AI");
    expect(note.type).toBe("explanation");
    expect(note.dismissed).toBe(false);
  });

  it("addNote stores metadata correctly", async () => {
    const repo = await state.addRepo("/tmp/notes-repo", "notes", "main");
    const note = await state.addNote(repo.id, {
      file_path: "src/file.ts",
      line_number: 10,
      text: "Suggestion",
      branch: "main",
      commit: "abc123",
      author: "AI",
      type: "suggestion",
      metadata: { confidence: "high", source: "gpt-4" },
    });
    
    expect(note.metadata).toEqual({ confidence: "high", source: "gpt-4" });
  });

  it("getNotes returns all for repo without branch filter", async () => {
    const repo = await state.addRepo("/tmp/notes-repo", "notes", "main");
    
    await state.addNote(repo.id, {
      file_path: "src/a.ts",
      line_number: 1,
      text: "Note 1",
      branch: "main",
      commit: "abc123",
      author: "AI",
      type: "explanation",
    });
    
    const note2 = await state.addNote(repo.id, {
      file_path: "src/b.ts",
      line_number: 1,
      text: "Note 2",
      branch: "feature",
      commit: "def456",
      author: "AI",
      type: "rationale",
    });
    await state.dismissNote(repo.id, note2.id);
    
    const allNotes = await state.getNotes(repo.id);
    expect(allNotes.length).toBe(2);
  });

  it("getNotes filters by branch (undismissed only)", async () => {
    const repo = await state.addRepo("/tmp/notes-repo", "notes", "main");
    
    await state.addNote(repo.id, {
      file_path: "src/a.ts",
      line_number: 1,
      text: "Active note",
      branch: "feature",
      commit: "abc123",
      author: "AI",
      type: "explanation",
    });
    
    const dismissed = await state.addNote(repo.id, {
      file_path: "src/b.ts",
      line_number: 1,
      text: "Dismissed note",
      branch: "feature",
      commit: "abc123",
      author: "AI",
      type: "explanation",
    });
    await state.dismissNote(repo.id, dismissed.id);
    
    const featureNotes = await state.getNotes(repo.id, "feature");
    expect(featureNotes.length).toBe(1);
    expect(featureNotes[0].text).toBe("Active note");
  });

  it("dismissNote marks as dismissed", async () => {
    const repo = await state.addRepo("/tmp/notes-repo", "notes", "main");
    const note = await state.addNote(repo.id, {
      file_path: "src/file.ts",
      line_number: 10,
      text: "To dismiss",
      branch: "main",
      commit: "abc123",
      author: "AI",
      type: "suggestion",
    });
    
    await state.dismissNote(repo.id, note.id, "user");
    
    const notes = await state.getNotes(repo.id);
    expect(notes[0].dismissed).toBe(true);
    expect(notes[0].dismissed_by).toBe("user");
    expect(notes[0].dismissed_at).toBeGreaterThan(0);
  });

  it("dismissNote returns false for unknown ID", async () => {
    const repo = await state.addRepo("/tmp/notes-repo", "notes", "main");
    const success = await state.dismissNote(repo.id, "nonexistent-id");
    expect(success).toBe(false);
  });

  it("note types are preserved", async () => {
    const repo = await state.addRepo("/tmp/notes-repo", "notes", "main");
    
    const types: Array<"explanation" | "rationale" | "suggestion"> = [
      "explanation",
      "rationale", 
      "suggestion",
    ];
    
    for (const type of types) {
      const note = await state.addNote(repo.id, {
        file_path: "src/file.ts",
        line_number: 1,
        text: `Note of type ${type}`,
        branch: "main",
        commit: "abc123",
        author: "AI",
        type,
      });
      expect(note.type).toBe(type);
    }
  });
});
