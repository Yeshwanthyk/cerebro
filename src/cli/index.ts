import { program } from "commander";
import { relative, resolve } from "path";
import { startServer, stopServer } from "../server";
import * as state from "../state";
import { getGitManager, isGitRepo, getRepoName } from "../git";
import type { Repository } from "../types";

const VERSION = "0.1.0";

export async function resolveRepo(repoOption?: string): Promise<Repository> {
  if (repoOption) {
    const repoById = await state.getRepo(repoOption);
    if (repoById) return repoById;

    const asPath = resolve(repoOption);
    const repoByPath = await state.getRepoByPath(asPath);
    if (repoByPath) return repoByPath;

    throw new Error(`Repository not found for id or path: ${repoOption}`);
  }

  const cwdRepo = await state.getRepoByPath(resolve(process.cwd()));
  if (cwdRepo) return cwdRepo;

  const currentRepo = await state.getCurrentRepo();
  if (currentRepo) return currentRepo;

  throw new Error("No repository found. Use 'cerebro repo add <path>' first or pass --repo.");
}

program
  .name("cerebro")
  .description("Git diff review tool with web interface")
  .version(VERSION);

// Start command
program
  .command("start")
  .description("Start the Cerebro server")
  .argument("[path]", "Repository path (defaults to current directory)")
  .option("-p, --port <number>", "Port to run on", "3030")
  .option("-o, --open", "Open browser after starting")
  .action(async (path: string | undefined, options: { port: string; open?: boolean }) => {
    const repoPath = resolve(path || process.cwd());
    const port = parseInt(options.port, 10);

    // Validate git repo
    if (!(await isGitRepo(repoPath))) {
      console.error(`Error: ${repoPath} is not a git repository`);
      process.exit(1);
    }

    // Add/get repo
    const git = getGitManager(repoPath);
    const baseBranch = await git.getDefaultBranch();
    const name = getRepoName(repoPath);
    const repo = await state.addRepo(repoPath, name, baseBranch);

    // Set as current
    await state.setCurrentRepo(repo.id);

    console.log(`Starting Cerebro for ${name} (${repoPath})`);
    console.log(`Base branch: ${baseBranch}`);

    // Start server
    await startServer({ port });

    if (options.open) {
      const url = `http://localhost:${port}`;
      // Open browser (macOS)
      Bun.spawn(["open", url]);
    }

    // Keep process running
    process.on("SIGINT", () => {
      console.log("\nShutting down...");
      stopServer();
      process.exit(0);
    });

    process.on("SIGTERM", () => {
      stopServer();
      process.exit(0);
    });
  });

// Repo commands
const repoCmd = program.command("repo").description("Manage repositories");

repoCmd
  .command("add")
  .description("Add a repository to track")
  .argument("<path>", "Path to the repository")
  .action(async (path: string) => {
    const repoPath = resolve(path);

    if (!(await isGitRepo(repoPath))) {
      console.error(`Error: ${repoPath} is not a git repository`);
      process.exit(1);
    }

    const git = getGitManager(repoPath);
    const baseBranch = await git.getDefaultBranch();
    const name = getRepoName(repoPath);

    const repo = await state.addRepo(repoPath, name, baseBranch);
    console.log(`Added repository: ${repo.name} (${repo.path})`);
    console.log(`ID: ${repo.id}`);
    console.log(`Base branch: ${repo.baseBranch}`);
  });

repoCmd
  .command("list")
  .description("List tracked repositories")
  .action(async () => {
    const repos = await state.getRepos();
    const reposState = await state.getReposState();

    if (repos.length === 0) {
      console.log("No repositories tracked. Use 'cerebro repo add <path>' to add one.");
      return;
    }

    console.log("Tracked repositories:\n");
    for (const repo of repos) {
      const current = repo.id === reposState.currentRepo ? " (current)" : "";
      console.log(`  ${repo.name}${current}`);
      console.log(`    Path: ${repo.path}`);
      console.log(`    Base: ${repo.baseBranch}`);
      console.log(`    ID: ${repo.id}`);
      console.log();
    }
  });

repoCmd
  .command("remove")
  .description("Remove a repository from tracking")
  .argument("<id>", "Repository ID")
  .action(async (id: string) => {
    const success = await state.removeRepo(id);
    if (success) {
      console.log(`Removed repository: ${id}`);
    } else {
      console.error(`Repository not found: ${id}`);
      process.exit(1);
    }
  });

repoCmd
  .command("set-current")
  .description("Set the current repository")
  .argument("<id>", "Repository ID")
  .action(async (id: string) => {
    const success = await state.setCurrentRepo(id);
    if (success) {
      const repo = await state.getRepo(id);
      console.log(`Current repository set to: ${repo?.name}`);
    } else {
      console.error(`Repository not found: ${id}`);
      process.exit(1);
    }
  });

// Config commands
const configCmd = program.command("config").description("Manage configuration");

configCmd
  .command("show")
  .description("Show current configuration")
  .action(async () => {
    const config = await state.getConfig();
    const currentRepo = await state.getCurrentRepo();

    console.log("Configuration:\n");
    console.log(`  Default port: ${config.defaultPort}`);
    if (currentRepo) {
      console.log(`  Current repo: ${currentRepo.name} (${currentRepo.path})`);
      console.log(`  Base branch: ${currentRepo.baseBranch}`);
    }
  });

configCmd
  .command("set")
  .description("Set a configuration value")
  .argument("<key>", "Configuration key (e.g., base-branch, port)")
  .argument("<value>", "Configuration value")
  .action(async (key: string, value: string) => {
    if (key === "base-branch") {
      const currentRepo = await state.getCurrentRepo();
      if (!currentRepo) {
        console.error("No current repository. Use 'cerebro repo add' first.");
        process.exit(1);
      }
      await state.updateRepo(currentRepo.id, { baseBranch: value });
      console.log(`Set base branch to: ${value}`);
    } else if (key === "port") {
      const config = await state.getConfig();
      config.defaultPort = parseInt(value, 10);
      await state.saveConfig(config);
      console.log(`Set default port to: ${value}`);
    } else {
      console.error(`Unknown config key: ${key}`);
      console.log("Available keys: base-branch, port");
      process.exit(1);
    }
  });

// Comments commands
const commentsCmd = program.command("comments").description("Work with comments");

commentsCmd
  .command("list")
  .description("List comments for a repository")
  .option("-r, --repo <idOrPath>", "Repository ID or path (defaults to current directory)")
  .option("-b, --branch <branch>", "Filter by branch")
  .action(async (options: { repo?: string; branch?: string }) => {
    let repo: Repository;
    try {
      repo = await resolveRepo(options.repo);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
      return;
    }

    const comments = await state.getComments(repo.id, options.branch);

    if (comments.length === 0) {
      console.log("No comments found.");
      return;
    }

    console.log(`Comments for ${repo.name} (${repo.path}):\n`);

    for (const comment of comments) {
      const lineInfo = comment.line_number !== undefined ? `:${comment.line_number}` : "";
      const location = `${relative(repo.path, comment.file_path) || comment.file_path}${lineInfo}`;
      const metaParts = [comment.branch && `branch ${comment.branch}`, comment.commit && `commit ${comment.commit.slice(0, 7)}`, comment.resolved ? "resolved" : "open"]
        .filter(Boolean)
        .join(" | ");

      console.log(`- ${location}${metaParts ? ` (${metaParts})` : ""}`);
      console.log(`  ${comment.text}`);
    }
  });

// Version command with more detail
program
  .command("version")
  .description("Show version information")
  .action(() => {
    console.log(`Cerebro v${VERSION}`);
    console.log(`Bun ${Bun.version}`);
  });

export function runCli(): void {
  program.parse();
}
