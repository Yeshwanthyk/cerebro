import { URL } from "url";

export interface GithubComment {
  id: number;
  body: string;
  user: string;
  path?: string;
  line?: number;
  url: string;
  created_at: string;
  type: "review" | "issue";
}

interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

function parseSshRemote(remote: string): GitHubRepoInfo | undefined {
  // git@github.com:owner/repo.git
  const match = remote.match(/^git@github\.com:(?<owner>[^/]+)\/(?<repo>.+?)(?:\.git)?$/);
  if (!match?.groups) return undefined;
  return { owner: match.groups.owner, repo: match.groups.repo };
}

function parseHttpsRemote(remote: string): GitHubRepoInfo | undefined {
  try {
    const url = new URL(remote);
    if (url.hostname !== "github.com") return undefined;
    const parts = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
    if (parts.length < 2) return undefined;
    const [owner, repo] = parts;
    return { owner, repo };
  } catch {
    return undefined;
  }
}

export function parseGithubRemote(remoteUrl: string | undefined): GitHubRepoInfo | undefined {
  if (!remoteUrl) return undefined;
  return parseSshRemote(remoteUrl) || parseHttpsRemote(remoteUrl);
}

async function githubRequest<T>(path: string, token?: string): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "cerebro-cli",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub API ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function findPrNumber(info: GitHubRepoInfo, branch: string, token?: string): Promise<number | undefined> {
  const head = `${info.owner}:${branch}`;
  const prs = await githubRequest<Array<{ number: number }>>(
    `/repos/${info.owner}/${info.repo}/pulls?state=all&per_page=1&head=${encodeURIComponent(head)}`,
    token
  );
  return prs[0]?.number;
}

async function fetchReviewComments(info: GitHubRepoInfo, prNumber: number, token?: string): Promise<GithubComment[]> {
  const comments = await githubRequest<Array<{ id: number; body: string; user: { login: string }; path?: string; line?: number; html_url: string; created_at: string }>>(
    `/repos/${info.owner}/${info.repo}/pulls/${prNumber}/comments?per_page=100`,
    token
  );

  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    user: c.user.login,
    path: c.path,
    line: c.line,
    url: c.html_url,
    created_at: c.created_at,
    type: "review" as const,
  }));
}

async function fetchIssueComments(info: GitHubRepoInfo, prNumber: number, token?: string): Promise<GithubComment[]> {
  const comments = await githubRequest<Array<{ id: number; body: string; user: { login: string }; html_url: string; created_at: string }>>(
    `/repos/${info.owner}/${info.repo}/issues/${prNumber}/comments?per_page=100`,
    token
  );

  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    user: c.user.login,
    url: c.html_url,
    created_at: c.created_at,
    type: "issue" as const,
  }));
}

export async function fetchGithubCommentsForBranch(params: {
  remoteUrl: string | undefined;
  branch: string;
  token?: string;
}): Promise<{ prNumber?: number; comments: GithubComment[]; repo?: GitHubRepoInfo }> {
  const repoInfo = parseGithubRemote(params.remoteUrl);
  if (!repoInfo) return { comments: [] };

  const prNumber = await findPrNumber(repoInfo, params.branch, params.token);
  if (!prNumber) return { comments: [], repo: repoInfo };

  const [review, issue] = await Promise.all([
    fetchReviewComments(repoInfo, prNumber, params.token),
    fetchIssueComments(repoInfo, prNumber, params.token),
  ]);

  return {
    prNumber,
    comments: [...review, ...issue].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    repo: repoInfo,
  };
}
