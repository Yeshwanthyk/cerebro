import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "bun:test";

// Local imports are done after HOME is set in beforeAll to ensure the state DB points to the temp directory.
import type { Repository } from "../types";

let originalHome: string | undefined;
let originalCwd: string;
let tempHome: string;
let configDir: string;

// Helpers loaded lazily so they pick up the temp HOME
let state: typeof import("../state");
let resolveRepo: (repoOption?: string) => Promise<Repository>;

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
  ({ resolveRepo } = await import("./index"));
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

describe("resolveRepo", () => {
  it("returns repo by id", async () => {
    const repo = await state.addRepo("/tmp/repo-by-id", "repo-id", "main");
    const resolved = await resolveRepo(repo.id);
    expect(resolved.id).toBe(repo.id);
  });

  it("returns repo by path", async () => {
    const repo = await state.addRepo("/tmp/repo-by-path", "repo-path", "develop");
    const resolved = await resolveRepo(repo.path);
    expect(resolved.id).toBe(repo.id);
    expect(resolved.baseBranch).toBe("develop");
  });

  it("falls back to current working directory repo", async () => {
    const repoPath = join(tempHome, "repos", "cwd-repo");
    mkdirSync(repoPath, { recursive: true });
    const repo = await state.addRepo(repoPath, "cwd-repo", "main");

    process.chdir(repoPath);
    const resolved = await resolveRepo();
    expect(resolved.id).toBe(repo.id);
  });

  it("falls back to current repo when cwd does not match", async () => {
    const repo = await state.addRepo("/tmp/repo-current", "repo-current", "main");
    await state.setCurrentRepo(repo.id);
    process.chdir(originalCwd);

    const resolved = await resolveRepo();
    expect(resolved.id).toBe(repo.id);
  });

  it("throws when no repo exists", async () => {
    const repos = await state.getRepos();
    expect(repos.length).toBe(0);
    await expect(resolveRepo()).rejects.toThrow("No repository found");
  });
});
