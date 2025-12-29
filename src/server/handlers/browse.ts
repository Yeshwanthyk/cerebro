/**
 * Directory browser handler for repo picker
 */
import { readdir, stat } from "fs/promises";
import { join, dirname, resolve } from "path";
import { homedir } from "os";

export async function handleBrowseDirectory(url: URL): Promise<Response> {
  let targetPath = url.searchParams.get("path") || homedir();
  targetPath = resolve(targetPath);

  try {
    const stats = await stat(targetPath);
    if (!stats.isDirectory()) {
      targetPath = dirname(targetPath);
    }
  } catch {
    // Path doesn't exist, fall back to home
    targetPath = homedir();
  }

  const entries: { name: string; path: string; type: "directory" | "file"; isGitRepo: boolean }[] = [];

  try {
    const items = await readdir(targetPath, { withFileTypes: true });

    for (const item of items) {
      // Skip hidden files/dirs except .git indicator
      if (item.name.startsWith(".") && item.name !== ".git") continue;
      if (item.name === ".git") continue; // Don't show .git dir itself

      const fullPath = join(targetPath, item.name);
      const isDir = item.isDirectory();

      if (!isDir) continue; // Only show directories for repo picker

      // Check if it's a git repo
      let isRepo = false;
      try {
        const gitPath = join(fullPath, ".git");
        const gitStats = await stat(gitPath);
        isRepo = gitStats.isDirectory();
      } catch {
        // Not a git repo
      }

      entries.push({
        name: item.name,
        path: fullPath,
        type: "directory",
        isGitRepo: isRepo,
      });
    }

    // Sort: git repos first, then alphabetical
    entries.sort((a, b) => {
      if (a.isGitRepo && !b.isGitRepo) return -1;
      if (!a.isGitRepo && b.isGitRepo) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch {
    return Response.json(
      {
        error: "Cannot read directory",
        currentPath: targetPath,
        parentPath: dirname(targetPath),
        entries: [],
      },
      { status: 400 }
    );
  }

  // Check if current directory is a git repo
  let currentIsGitRepo = false;
  try {
    const gitPath = join(targetPath, ".git");
    const gitStats = await stat(gitPath);
    currentIsGitRepo = gitStats.isDirectory();
  } catch {
    // Not a git repo
  }

  return Response.json({
    currentPath: targetPath,
    parentPath: dirname(targetPath) !== targetPath ? dirname(targetPath) : null,
    currentIsGitRepo,
    entries,
  });
}
