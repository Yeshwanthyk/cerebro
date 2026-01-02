/**
 * GitHub CLI wrapper for PR operations
 * Uses `gh` CLI tool for all GitHub interactions
 */

import type { PullRequest, PRFilter } from "../types";

// Re-export for convenience
export type { PullRequest, PRFilter };

export interface PRFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface PRDetails extends PullRequest {
  files: PRFile[];
}

interface GhError {
  message: string;
  code?: string;
}

/**
 * Execute gh CLI command and return parsed JSON output
 */
async function ghJson<T>(args: string[], cwd: string): Promise<T> {
  const proc = Bun.spawn(["gh", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const error: GhError = { message: stderr.trim() || `gh exited with code ${exitCode}` };
    if (stderr.includes("authentication")) {
      error.code = "AUTH_REQUIRED";
    } else if (stderr.includes("not found") || stderr.includes("Could not resolve")) {
      error.code = "NOT_FOUND";
    }
    throw error;
  }

  return JSON.parse(stdout) as T;
}

/**
 * Execute gh CLI command and return raw text output
 */
async function ghText(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(["gh", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const error: GhError = { message: stderr.trim() || `gh exited with code ${exitCode}` };
    throw error;
  }

  return stdout;
}

/**
 * List open pull requests for a repository
 */
export async function listPRs(
  repoPath: string,
  filter: PRFilter = "all"
): Promise<PullRequest[]> {
  const args = [
    "pr",
    "list",
    "--json",
    "number,title,headRefName,baseRefName,author,createdAt,url,state,additions,deletions,changedFiles,body",
  ];

  switch (filter) {
    case "mine":
      args.push("--author", "@me");
      break;
    case "review-requested":
      args.push("--search", "review-requested:@me");
      break;
    case "all":
      // No additional filter
      break;
  }

  const prs = await ghJson<PullRequest[]>(args, repoPath);
  return prs;
}

/**
 * Get details for a specific PR
 */
export async function getPR(repoPath: string, prNumber: number): Promise<PRDetails> {
  const pr = await ghJson<PRDetails>(
    [
      "pr",
      "view",
      String(prNumber),
      "--json",
      "number,title,headRefName,baseRefName,author,createdAt,url,state,additions,deletions,changedFiles,body,files",
    ],
    repoPath
  );
  return pr;
}

/**
 * Get unified diff for a PR
 */
export async function getPRDiff(repoPath: string, prNumber: number): Promise<string> {
  return ghText(["pr", "diff", String(prNumber)], repoPath);
}

/**
 * Approve a PR with optional body
 */
export async function approvePR(
  repoPath: string,
  prNumber: number,
  body?: string
): Promise<void> {
  const args = ["pr", "review", String(prNumber), "--approve"];
  if (body) {
    args.push("-b", body);
  }
  await ghText(args, repoPath);
}

/**
 * Add a review comment to a PR
 */
export async function commentOnPR(
  repoPath: string,
  prNumber: number,
  body: string
): Promise<void> {
  await ghText(["pr", "review", String(prNumber), "--comment", "-b", body], repoPath);
}

/**
 * Request changes on a PR
 */
export async function requestChanges(
  repoPath: string,
  prNumber: number,
  body: string
): Promise<void> {
  await ghText(["pr", "review", String(prNumber), "--request-changes", "-b", body], repoPath);
}

/**
 * Check if gh CLI is available and authenticated
 */
export async function checkGhAuth(repoPath: string): Promise<boolean> {
  try {
    await ghText(["auth", "status"], repoPath);
    return true;
  } catch {
    return false;
  }
}
