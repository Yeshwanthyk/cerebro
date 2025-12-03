import { program } from "commander";
import { relative, resolve } from "path";
import { startServer, stopServer } from "../server";
import * as state from "../state";
import { getGitManager, isGitRepo, getRepoName } from "../git";
import { fetchGithubCommentsForBranch, type GithubComment } from "../github";
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
    console.log(`  GitHub token: ${config.githubToken ? "set" : "not set"}`);
    if (currentRepo) {
      console.log(`  Current repo: ${currentRepo.name} (${currentRepo.path})`);
      console.log(`  Base branch: ${currentRepo.baseBranch}`);
    }
  });

configCmd
  .command("set")
  .description("Set a configuration value")
  .argument("<key>", "Configuration key (e.g., base-branch, port, github-token)")
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
    } else if (key === "github-token") {
      const config = await state.getConfig();
      config.githubToken = value;
      await state.saveConfig(config);
      console.log(`GitHub token saved to config.`);
    } else {
      console.error(`Unknown config key: ${key}`);
      console.log("Available keys: base-branch, port, github-token");
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
  .option("-g, --github", "Include GitHub PR comments for the branch")
  .option("--github-token <token>", "GitHub token (defaults to GITHUB_TOKEN env)")
  .action(async (options: { repo?: string; branch?: string; github?: boolean; githubToken?: string }) => {
    let repo: Repository;
    try {
      repo = await resolveRepo(options.repo);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
      return;
    }

    const config = await state.getConfig();
    const githubToken = options.githubToken || process.env.GITHUB_TOKEN || config.githubToken;

    const comments = await state.getComments(repo.id, options.branch);

    let githubComments: GithubComment[] = [];
    let githubMeta: { prNumber?: number; repo?: { owner: string; repo: string } } = {};

    if (options.github) {
      const git = getGitManager(repo.path);
      const remoteUrl = await git.getRemoteUrl();
      const branchForGithub = options.branch || (await git.getCurrentBranch());

      try {
        const gh = await fetchGithubCommentsForBranch({
          remoteUrl,
          branch: branchForGithub,
          token: githubToken,
        });
        githubComments = gh.comments;
        githubMeta = { prNumber: gh.prNumber, repo: gh.repo };
      } catch (err) {
        console.error(`Failed to fetch GitHub comments: ${(err as Error).message}`);
      }
    }

    if (comments.length === 0) {
      console.log("No comments found.");
    } else {
      console.log(`Comments for ${repo.name} (${repo.path}):\n`);

      for (const comment of comments) {
        const lineInfo = comment.line_number !== undefined ? `:${comment.line_number}` : "";
        const location = `${relative(repo.path, comment.file_path) || comment.file_path}${lineInfo}`;
        const metaParts = [comment.branch && `branch ${comment.branch}`, comment.commit && `commit ${comment.commit.slice(0, 7)}`, comment.resolved ? "resolved" : "open"]
          .filter(Boolean)
          .join(" | ");

        console.log(`- [${comment.id}] ${location}${metaParts ? ` (${metaParts})` : ""}`);
        console.log(`  ${comment.text}`);
      }
    }

    if (options.github) {
      const { repo: ghRepo, prNumber } = githubMeta;

      if (!githubMeta.repo) {
        console.log("\nGitHub: origin remote not detected or not on github.com.");
      } else if (!prNumber) {
        console.log(`\nGitHub: no pull request found for ${githubMeta.repo.owner}:${options.branch || "current branch"}.`);
      } else if (githubComments.length === 0) {
        console.log(`\nGitHub PR #${prNumber} (${ghRepo?.owner}/${ghRepo?.repo}): no comments.`);
      } else {
        console.log(`\nGitHub PR #${prNumber} (${ghRepo?.owner}/${ghRepo?.repo}):\n`);
        for (const comment of githubComments) {
          const location = comment.path ? `${comment.path}${comment.line ? `:${comment.line}` : ""}` : `PR #${prNumber}`;
          const metaParts = [`@${comment.user}`, comment.type === "review" ? "review" : "issue", comment.created_at.slice(0, 10)].filter(Boolean).join(" | ");

          console.log(`- [gh:${comment.id}] ${location}${metaParts ? ` (${metaParts})` : ""}`);
          console.log(`  ${comment.body}`);
        }
      }
    }
  });

commentsCmd
  .command("resolve")
  .description("Resolve a comment by ID")
  .argument("<commentId>", "Comment ID to resolve")
  .option("-r, --repo <idOrPath>", "Repository ID or path (defaults to current directory)")
  .option("--by <name>", "Name to record as resolver (defaults to 'cli')")
  .action(async (commentId: string, options: { repo?: string; by?: string }) => {
    let repo: Repository;
    try {
      repo = await resolveRepo(options.repo);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
      return;
    }

    const resolvedBy = options.by || "cli";
    const success = await state.resolveComment(repo.id, commentId, resolvedBy);
    if (!success) {
      console.error(`Comment not found: ${commentId}`);
      process.exit(1);
      return;
    }

    console.log(`Resolved comment ${commentId} in ${repo.name} as ${resolvedBy}.`);
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
