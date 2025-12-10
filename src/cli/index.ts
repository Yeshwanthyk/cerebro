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
  .argument("[path]", "Repository path (optional, use repo picker if not provided)")
  .option("-p, --port <number>", "Port to run on", "3030")
  .option("-o, --open", "Open browser after starting")
  .action(async (path: string | undefined, options: { port: string; open?: boolean }) => {
    const port = parseInt(options.port, 10);

    // If path provided, validate and set as current repo
    if (path) {
      const repoPath = resolve(path);
      
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
    } else {
      // No path - check if cwd is a git repo
      const cwd = process.cwd();
      if (await isGitRepo(cwd)) {
        const git = getGitManager(cwd);
        const baseBranch = await git.getDefaultBranch();
        const name = getRepoName(cwd);
        const repo = await state.addRepo(cwd, name, baseBranch);
        await state.setCurrentRepo(repo.id);
        console.log(`Starting Cerebro for ${name} (${cwd})`);
      } else {
        // Start without a repo - UI will show repo picker
        console.log("Starting Cerebro (no repository selected)");
        console.log("Use the web UI to add and select a repository");
      }
    }

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
  .option("--json", "Output as JSON for programmatic access")
  .action(async (options: { repo?: string; branch?: string; json?: boolean }) => {
    let repo: Repository;
    try {
      repo = await resolveRepo(options.repo);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
      return;
    }

    const comments = await state.getComments(repo.id, options.branch);

    if (options.json) {
      console.log(JSON.stringify(comments, null, 2));
      return;
    }

    if (comments.length === 0) {
      console.log("No comments found.");
      return;
    }

    console.log(`Comments for ${repo.name} (${repo.path}):\n`);

    for (const comment of comments) {
      const lineInfo = comment.line_number !== undefined ? `:${comment.line_number}` : "";
      const location = `${relative(repo.path, comment.file_path) || comment.file_path}${lineInfo}`;
      const status = comment.resolved ? "resolved" : "open";
      const metaParts = [comment.branch && `branch ${comment.branch}`, comment.commit && `commit ${comment.commit.slice(0, 7)}`, status]
        .filter(Boolean)
        .join(" | ");

      console.log(`[${comment.id}] ${location} (${metaParts})`);
      console.log(`  ${comment.text}`);
      if (comment.parent_id) {
        console.log(`  ↳ reply to ${comment.parent_id}`);
      }
      console.log();
    }
  });

commentsCmd
  .command("add")
  .description("Add a comment to a file")
  .argument("<text>", "Comment text")
  .option("-r, --repo <idOrPath>", "Repository ID or path")
  .option("-f, --file <path>", "File path (required)")
  .option("-l, --line <number>", "Line number")
  .option("-b, --branch <branch>", "Branch name")
  .option("-c, --commit <hash>", "Commit hash")
  .action(async (text: string, options: { repo?: string; file?: string; line?: string; branch?: string; commit?: string }) => {
    if (!options.file) {
      console.error("Error: --file is required");
      process.exit(1);
    }

    let repo: Repository;
    try {
      repo = await resolveRepo(options.repo);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
      return;
    }

    let branch = options.branch;
    let commit = options.commit;
    if (!branch || !commit) {
      const git = getGitManager(repo.path);
      branch = branch || (await git.getCurrentBranch());
      commit = commit || (await git.getCurrentCommit());
    }
    const filePath = resolve(repo.path, options.file);

    const comment = await state.addComment(repo.id, {
      file_path: filePath,
      line_number: options.line ? parseInt(options.line, 10) : undefined,
      text,
      branch,
      commit,
    });

    console.log(`Added comment: ${comment.id}`);
  });

commentsCmd
  .command("resolve")
  .description("Resolve a comment")
  .argument("<id>", "Comment ID")
  .option("-r, --repo <idOrPath>", "Repository ID or path (optional, resolution is repo-agnostic)")
  .option("--by <name>", "Who resolved it", "user")
  .action(async (id: string, { by }: { repo?: string; by: string }) => {
    const success = await state.resolveComment(id, by);
    if (success) {
      console.log(`Resolved comment: ${id}`);
    } else {
      console.error(`Comment not found: ${id}`);
      process.exit(1);
    }
  });

commentsCmd
  .command("reply")
  .description("Reply to an existing comment")
  .argument("<parentId>", "Parent comment ID")
  .argument("<text>", "Reply text")
  .action(async (parentId: string, text: string) => {
    const parent = await state.getCommentById(parentId);

    if (!parent) {
      console.error(`Comment not found: ${parentId}`);
      process.exit(1);
      return;
    }

    const reply = await state.addComment(parent.repo_id, {
      file_path: parent.file_path,
      line_number: parent.line_number,
      text,
      branch: parent.branch,
      commit: parent.commit,
      parent_id: parent.id,
    });

    console.log(`Added reply: ${reply.id}`);
  });

// Notes commands
const notesCmd = program.command("notes").description("Work with notes");

notesCmd
  .command("list")
  .description("List notes for a repository")
  .option("-r, --repo <idOrPath>", "Repository ID or path")
  .option("-b, --branch <branch>", "Filter by branch")
  .option("--json", "Output as JSON for programmatic access")
  .action(async (options: { repo?: string; branch?: string; json?: boolean }) => {
    let repo: Repository;
    try {
      repo = await resolveRepo(options.repo);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
      return;
    }

    const notes = await state.getNotes(repo.id, options.branch);

    if (options.json) {
      console.log(JSON.stringify(notes, null, 2));
      return;
    }

    if (notes.length === 0) {
      console.log("No notes found.");
      return;
    }

    console.log(`Notes for ${repo.name} (${repo.path}):\n`);

    for (const note of notes) {
      const location = `${relative(repo.path, note.file_path) || note.file_path}:${note.line_number}`;
      const metaParts = [
        note.type,
        note.branch && `branch ${note.branch}`,
        note.dismissed ? "dismissed" : "active",
      ]
        .filter(Boolean)
        .join(" | ");

      console.log(`[${note.id}] ${location} (${metaParts})`);
      console.log(`  Author: ${note.author}`);
      console.log(`  ${note.text}`);
      console.log();
    }
  });

notesCmd
  .command("add")
  .description("Add a note to a file")
  .argument("<text>", "Note text")
  .option("-r, --repo <idOrPath>", "Repository ID or path")
  .option("-f, --file <path>", "File path (required)")
  .option("-l, --line <number>", "Line number (required)")
  .option("-t, --type <type>", "Note type: explanation, rationale, suggestion", "explanation")
  .option("-a, --author <name>", "Author name", "user")
  .option("-b, --branch <branch>", "Branch name")
  .option("-c, --commit <hash>", "Commit hash")
  .action(async (text: string, options: { repo?: string; file?: string; line?: string; type: string; author: string; branch?: string; commit?: string }) => {
    if (!options.file) {
      console.error("Error: --file is required");
      process.exit(1);
    }
    if (!options.line) {
      console.error("Error: --line is required");
      process.exit(1);
    }

    const validTypes = ["explanation", "rationale", "suggestion"];
    if (!validTypes.includes(options.type)) {
      console.error(`Error: --type must be one of: ${validTypes.join(", ")}`);
      process.exit(1);
    }

    let repo: Repository;
    try {
      repo = await resolveRepo(options.repo);
    } catch (err) {
      console.error((err as Error).message);
      process.exit(1);
      return;
    }

    let branch = options.branch;
    let commit = options.commit;
    if (!branch || !commit) {
      const git = getGitManager(repo.path);
      branch = branch || (await git.getCurrentBranch());
      commit = commit || (await git.getCurrentCommit());
    }
    const filePath = resolve(repo.path, options.file);

    const note = await state.addNote(repo.id, {
      file_path: filePath,
      line_number: parseInt(options.line, 10),
      text,
      branch,
      commit,
      author: options.author,
      type: options.type as "explanation" | "rationale" | "suggestion",
    });

    console.log(`Added note: ${note.id}`);
  });

notesCmd
  .command("dismiss")
  .description("Dismiss a note")
  .argument("<id>", "Note ID")
  .option("-r, --repo <idOrPath>", "Repository ID or path (optional, ignored)")
  .option("--by <name>", "Who dismissed it", "user")
  .action(async (id: string, { by }: { repo?: string; by: string }) => {
    const success = await state.dismissNote(id, by);
    if (success) {
      console.log(`Dismissed note: ${id}`);
    } else {
      console.error(`Note not found: ${id}`);
      process.exit(1);
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
