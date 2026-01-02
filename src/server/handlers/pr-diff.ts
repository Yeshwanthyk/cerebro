/**
 * Parse unified diff output from `gh pr diff` into FileDiff format
 */
import type { FileDiff } from "../../types";

interface ViewedState {
  [filePath: string]: boolean;
}

/**
 * Parse a unified diff string into an array of FileDiff objects
 */
export function parseUnifiedDiff(rawDiff: string, viewedState: ViewedState): FileDiff[] {
  const files: FileDiff[] = [];
  const fileChunks = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const file = parseFileChunk("diff --git " + chunk, viewedState);
    if (file) {
      files.push(file);
    }
  }

  return files;
}

function parseFileChunk(chunk: string, viewedState: ViewedState): FileDiff | null {
  const lines = chunk.split("\n");
  const firstLine = lines[0];

  // Parse header: diff --git a/path b/path
  if (!firstLine) return null;
  const headerMatch = firstLine.match(/^diff --git a\/(.+) b\/(.+)$/);
  if (!headerMatch?.[1] || !headerMatch[2]) return null;

  const oldPath = headerMatch[1];
  const newPath = headerMatch[2];
  const path = newPath;

  // Determine status from diff metadata
  let status: FileDiff["status"] = "modified";
  let additions = 0;
  let deletions = 0;

  // Look for new/deleted file indicators
  for (const line of lines.slice(1, 10)) {
    if (line.startsWith("new file mode")) {
      status = "added";
    } else if (line.startsWith("deleted file mode")) {
      status = "deleted";
    } else if (line.startsWith("rename from")) {
      status = "renamed";
    }
  }

  // Count additions and deletions from diff content
  const patchLines: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith("@@")) {
      inHunk = true;
    }

    if (inHunk) {
      patchLines.push(line);
      if (line.startsWith("+") && !line.startsWith("+++")) {
        additions++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        deletions++;
      }
    }
  }

  const patch = patchLines.join("\n");

  return {
    path,
    status,
    additions,
    deletions,
    patch,
    viewed: viewedState[path] ?? false,
    old_file: status !== "added" ? { name: oldPath, contents: "" } : undefined,
    new_file: status !== "deleted" ? { name: newPath, contents: "" } : undefined,
  };
}
