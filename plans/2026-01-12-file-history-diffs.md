# File History Diffs Implementation Plan

## Plan Metadata
- Created: 2026-01-12
- Status: draft
- Depends on: `2026-01-12-commit-level-diffs.md` (uses Commit type, git patterns)
- Assumptions:
  - File history accessed from file context menu or action button
  - Shows commits that touched the file with ability to view each change
  - Uses `--follow` to track renames

## Progress Tracking
- [ ] Phase 1: Backend - Git Operations
- [ ] Phase 2: Backend - API Endpoints
- [ ] Phase 3: Frontend - Hook & Types
- [ ] Phase 4: Frontend - FileHistory Modal
- [ ] Phase 5: Integration

## Overview
Add ability to view a file's history - all commits that modified the file, with the ability to view the diff for any specific commit. Accessed via a "History" button/menu on file cards.

## Current State

### Key Discoveries

**FileCard actions** (`web/src/components/FileCard.tsx`):
```typescript
// Existing actions: stage, unstage, discard, viewed toggle
<button onClick={onStage}>Stage</button>
<button onClick={onDiscard}>Discard</button>
```

**Modal pattern** (`web/src/components/Modal.tsx`):
```typescript
interface ModalProps {
  onClose: () => void;
  className?: string;
  children: React.ReactNode;
}
```

**Git operations** - can use:
```bash
git log --follow --format='%H|%s|%an|%aI' -- <path>
git show <sha> -- <path>  # patch for file at commit
git show <sha>:<path>     # contents at commit
git show <sha>^:<path>    # contents at parent
```

## Desired End State

- "History" button on FileCard (all modes)
- Opens modal showing commits that touched the file
- Each commit shows: sha, message, author, date, +/- for that file
- Click commit to view that commit's diff for the file
- Supports renamed files via `--follow`

### Verification
```bash
# Backend
curl "http://localhost:3030/api/file-history?repo=<id>&path=src/index.ts" | jq '.entries | length'
curl "http://localhost:3030/api/file-history-diff?repo=<id>&path=src/index.ts&commit=abc123" | jq '.patch'
```

**Manual**:
- History button visible on file cards
- Modal shows commit list for file
- Can view diff for specific commit

## Out of Scope
- Comparing two arbitrary commits (just single commit view)
- Blame view (line-by-line attribution)
- Branch history (stick to current branch)

## Breaking Changes
None - all additive

## Implementation Approach

1. Add git operations for file-specific history
2. Add API endpoints for file history
3. Create FileHistory modal component
4. Add History button to FileCard
5. Wire up modal state in App.tsx

## Phase Dependencies and Parallelization
- All phases sequential
- Depends on Commit type from commit-level-diffs plan (or define locally)

---

## Phase 1: Backend - Git Operations

### Overview
Add git operations for fetching file history and file-specific commit diffs.

### Prerequisites
- [ ] Commit type exists in `src/types/index.ts` (from commit-diffs plan, or add here)

### Change Checklist
- [ ] Create `src/git/history.ts`
- [ ] Export from git index

### Changes

#### 1. Create File History Module
**File**: `src/git/history.ts`
**Location**: New file

**Add**:
```typescript
/**
 * Git file history operations
 */
import type { SimpleGit } from "simple-git";
import type { FileDiff } from "../types";
import { countChanges, getFileContents } from "./diff";
import { basename } from "path";

export interface FileHistoryEntry {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  additions: number;
  deletions: number;
}

/**
 * Get commit history for a specific file (follows renames)
 */
export async function getFileHistory(
  git: SimpleGit,
  filePath: string,
  limit: number = 50
): Promise<FileHistoryEntry[]> {
  // Get commits that touched this file
  const log = await git.raw([
    "log",
    `--max-count=${limit}`,
    "--follow",
    "--format=%H|%s|%an|%aI",
    "--",
    filePath,
  ]);

  if (!log.trim()) {
    return [];
  }

  const entries: FileHistoryEntry[] = [];
  const lines = log.trim().split("\n");

  for (const line of lines) {
    const [sha, message, author, date] = line.split("|");
    if (!sha || !message || !author || !date) continue;

    // Get stats for this specific file in this commit
    let additions = 0;
    let deletions = 0;

    try {
      const numstat = await git.raw([
        "show",
        sha,
        "--format=",
        "--numstat",
        "--",
        filePath,
      ]);

      const statLine = numstat.trim().split("\n")[0];
      if (statLine) {
        const [add, del] = statLine.split("\t");
        additions = add === "-" ? 0 : parseInt(add ?? "0", 10);
        deletions = del === "-" ? 0 : parseInt(del ?? "0", 10);
      }
    } catch {
      // Stats not available, leave as 0
    }

    entries.push({
      sha,
      shortSha: sha.slice(0, 7),
      message,
      author,
      date,
      additions,
      deletions,
    });
  }

  return entries;
}

/**
 * Get diff for a specific file at a specific commit
 */
export async function getFileHistoryDiff(
  git: SimpleGit,
  filePath: string,
  sha: string
): Promise<FileDiff | null> {
  try {
    // Get patch for this file at this commit
    const patch = await git.raw([
      "show",
      sha,
      "--format=",
      "--",
      filePath,
    ]);

    if (!patch.trim()) {
      return null;
    }

    const { additions, deletions } = countChanges(patch);

    // Determine file status from patch header
    let fileStatus: FileDiff["status"] = "modified";
    if (patch.includes("new file mode")) {
      fileStatus = "added";
    } else if (patch.includes("deleted file mode")) {
      fileStatus = "deleted";
    } else if (patch.includes("rename from")) {
      fileStatus = "renamed";
    }

    // Get file contents
    const parentSha = `${sha}^`;
    
    // For renamed files, we need to find the old path
    let oldPath = filePath;
    const renameMatch = patch.match(/rename from (.+)/);
    if (renameMatch?.[1]) {
      oldPath = renameMatch[1];
    }

    const oldFile = fileStatus !== "added"
      ? await getFileContents(git, parentSha, oldPath)
      : undefined;
    const newFile = fileStatus !== "deleted"
      ? await getFileContents(git, sha, filePath)
      : undefined;

    return {
      path: filePath,
      status: fileStatus,
      additions,
      deletions,
      patch,
      viewed: false,
      old_file: oldFile,
      new_file: newFile,
    };
  } catch {
    return null;
  }
}
```

#### 2. Export from Git Index
**File**: `src/git/index.ts`
**Location**: Add to exports

**Add**:
```typescript
export * from "./history";
```

### Success Criteria

**Automated**:
```bash
cd src && npx tsc --noEmit
```

### Rollback
```bash
rm src/git/history.ts
git restore -- src/git/index.ts
```

---

## Phase 2: Backend - API Endpoints

### Overview
Add API endpoints for file history and file-specific commit diffs.

### Prerequisites
- [ ] Phase 1 complete

### Change Checklist
- [ ] Create `src/server/handlers/history.ts`
- [ ] Export from handlers index
- [ ] Add routes

### Changes

#### 1. Create History Handler
**File**: `src/server/handlers/history.ts`
**Location**: New file

**Add**:
```typescript
/**
 * File history handlers
 */
import { getGitManager } from "../../git";
import { getFileHistory, getFileHistoryDiff, type FileHistoryEntry } from "../../git/history";
import { getCurrentRepoFromRequest, noRepoError } from "./utils";

/**
 * GET /api/file-history?path=<file> - Get commit history for a file
 */
export async function handleGetFileHistory(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const filePath = url.searchParams.get("path");
  if (!filePath) {
    return Response.json({ error: "File path required" }, { status: 400 });
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 50;

  try {
    const git = getGitManager(repo.path);
    const entries = await getFileHistory(git.git, filePath, limit);
    return Response.json({ entries, file_path: filePath, repo_path: repo.path });
  } catch (error) {
    const err = error as { message: string };
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * GET /api/file-history-diff?path=<file>&commit=<sha> - Get file diff at commit
 */
export async function handleGetFileHistoryDiff(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return noRepoError();
  }

  const filePath = url.searchParams.get("path");
  if (!filePath) {
    return Response.json({ error: "File path required" }, { status: 400 });
  }

  const sha = url.searchParams.get("commit");
  if (!sha) {
    return Response.json({ error: "Commit SHA required" }, { status: 400 });
  }

  try {
    const git = getGitManager(repo.path);
    const fileDiff = await getFileHistoryDiff(git.git, filePath, sha);

    if (!fileDiff) {
      return Response.json({ error: "File not found in commit" }, { status: 404 });
    }

    return Response.json(fileDiff);
  } catch (error) {
    const err = error as { message: string };
    return Response.json({ error: err.message }, { status: 500 });
  }
}
```

#### 2. Export from Handlers Index
**File**: `src/server/handlers/index.ts`
**Location**: Add to exports

**Add**:
```typescript
export { handleGetFileHistory, handleGetFileHistoryDiff } from "./history";
```

#### 3. Add Routes
**File**: `src/server/routes.ts`
**Location**: After commits routes

**Add import**:
```typescript
import {
  // ... existing
  handleGetFileHistory,
  handleGetFileHistoryDiff,
} from "./handlers";
```

**Add routes**:
```typescript
  // File history
  { path: "/api/file-history", method: "GET", handler: async (_req, url) => handleGetFileHistory(url) },
  { path: "/api/file-history-diff", method: "GET", handler: async (_req, url) => handleGetFileHistoryDiff(url) },
```

### Success Criteria

**Automated**:
```bash
npx tsc --noEmit
```

**Manual**:
```bash
curl "http://localhost:3030/api/file-history?repo=<id>&path=src/index.ts" | jq '.entries[0]'
curl "http://localhost:3030/api/file-history-diff?repo=<id>&path=src/index.ts&commit=HEAD" | jq '.patch'
```

### Rollback
```bash
rm src/server/handlers/history.ts
git restore -- src/server/handlers/index.ts src/server/routes.ts
```

---

## Phase 3: Frontend - Hook & Types

### Overview
Add frontend types and useFileHistory hook.

### Prerequisites
- [ ] Phase 2 complete

### Change Checklist
- [ ] Add types to `web/src/api/types.ts`
- [ ] Create `web/src/hooks/useFileHistory.ts`

### Changes

#### 1. Add Frontend Types
**File**: `web/src/api/types.ts`
**Location**: Add after Commit types

**Add**:
```typescript
// File history types
export interface FileHistoryEntry {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  additions: number;
  deletions: number;
}

export interface FileHistoryResponse {
  entries: FileHistoryEntry[];
  file_path: string;
  repo_path: string;
}
```

#### 2. Create useFileHistory Hook
**File**: `web/src/hooks/useFileHistory.ts`
**Location**: New file

**Add**:
```typescript
import { useCallback, useState } from "react";
import type { FileHistoryEntry, FileHistoryResponse, FileDiff } from "../api/types";

interface UseFileHistoryResult {
  entries: FileHistoryEntry[];
  loading: boolean;
  error: string | null;
  selectedEntry: FileHistoryEntry | null;
  fileDiff: FileDiff | null;
  diffLoading: boolean;
  fetchHistory: (filePath: string) => Promise<void>;
  selectEntry: (entry: FileHistoryEntry | null) => void;
  fetchDiff: (filePath: string, sha: string) => Promise<void>;
  reset: () => void;
}

export function useFileHistory(repoId?: string | null): UseFileHistoryResult {
  const [entries, setEntries] = useState<FileHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<FileHistoryEntry | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const buildUrl = useCallback(
    (path: string, params: Record<string, string> = {}) => {
      const url = new URL(path, window.location.origin);
      if (repoId) {
        url.searchParams.set("repo", repoId);
      }
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
      return url.pathname + url.search;
    },
    [repoId]
  );

  const fetchHistory = useCallback(
    async (filePath: string) => {
      if (!repoId) {
        setEntries([]);
        return;
      }

      setLoading(true);
      setError(null);
      setSelectedEntry(null);
      setFileDiff(null);

      try {
        const res = await fetch(buildUrl("/api/file-history", { path: filePath }));
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to fetch history");
        }
        const data = (await res.json()) as FileHistoryResponse;
        setEntries(data.entries);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch history");
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [repoId, buildUrl]
  );

  const fetchDiff = useCallback(
    async (filePath: string, sha: string) => {
      if (!repoId) return;

      setDiffLoading(true);

      try {
        const res = await fetch(
          buildUrl("/api/file-history-diff", { path: filePath, commit: sha })
        );
        if (!res.ok) {
          throw new Error("Failed to fetch diff");
        }
        const data = (await res.json()) as FileDiff;
        setFileDiff(data);
      } catch {
        setFileDiff(null);
      } finally {
        setDiffLoading(false);
      }
    },
    [repoId, buildUrl]
  );

  const selectEntry = useCallback((entry: FileHistoryEntry | null) => {
    setSelectedEntry(entry);
    if (entry === null) {
      setFileDiff(null);
    }
  }, []);

  const reset = useCallback(() => {
    setEntries([]);
    setSelectedEntry(null);
    setFileDiff(null);
    setError(null);
  }, []);

  return {
    entries,
    loading,
    error,
    selectedEntry,
    fileDiff,
    diffLoading,
    fetchHistory,
    selectEntry,
    fetchDiff,
    reset,
  };
}
```

### Success Criteria

**Automated**:
```bash
cd web && bun run check
```

### Rollback
```bash
git restore -- web/src/api/types.ts
rm web/src/hooks/useFileHistory.ts
```

---

## Phase 4: Frontend - FileHistory Modal

### Overview
Create the FileHistory modal component with commit list and diff view.

### Prerequisites
- [ ] Phase 3 complete

### Change Checklist
- [ ] Create `web/src/components/FileHistory/` component
- [ ] Add CSS styles

### Changes

#### 1. Create FileHistory Component
**File**: `web/src/components/FileHistory/FileHistory.tsx`
**Location**: New file

**Add**:
```typescript
import { useEffect } from "react";
import { Modal } from "../Modal";
import { DiffView } from "../DiffView";
import type { FileHistoryEntry, FileDiff } from "../../api/types";
import "./FileHistory.css";

interface FileHistoryProps {
  filePath: string;
  entries: FileHistoryEntry[];
  loading: boolean;
  error: string | null;
  selectedEntry: FileHistoryEntry | null;
  fileDiff: FileDiff | null;
  diffLoading: boolean;
  diffStyle: "split" | "unified";
  onSelectEntry: (entry: FileHistoryEntry | null) => void;
  onFetchDiff: (sha: string) => void;
  onClose: () => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FileHistory({
  filePath,
  entries,
  loading,
  error,
  selectedEntry,
  fileDiff,
  diffLoading,
  diffStyle,
  onSelectEntry,
  onFetchDiff,
  onClose,
}: FileHistoryProps) {
  // Fetch diff when entry selected
  useEffect(() => {
    if (selectedEntry) {
      onFetchDiff(selectedEntry.sha);
    }
  }, [selectedEntry, onFetchDiff]);

  const fileName = filePath.split("/").pop() ?? filePath;

  return (
    <Modal onClose={onClose} className="file-history-modal">
      <div className="file-history">
        <div className="file-history-header">
          <h2>History: {fileName}</h2>
          <span className="file-history-path">{filePath}</span>
        </div>

        {selectedEntry ? (
          <div className="file-history-diff-view">
            <div className="file-history-diff-header">
              <button
                type="button"
                className="file-history-back"
                onClick={() => onSelectEntry(null)}
              >
                ← Back to history
              </button>
              <div className="file-history-commit-info">
                <span className="commit-sha">{selectedEntry.shortSha}</span>
                <span className="commit-message">{selectedEntry.message}</span>
                <span className="commit-author">by {selectedEntry.author}</span>
              </div>
            </div>

            {diffLoading && (
              <div className="file-history-loading">Loading diff...</div>
            )}

            {!diffLoading && fileDiff && (
              <div className="file-history-diff-content">
                <DiffView
                  file={fileDiff}
                  comments={[]}
                  commentThreads={[]}
                  notes={[]}
                  diffStyle={diffStyle}
                  onResolveComment={() => {}}
                  onDismissNote={() => {}}
                />
              </div>
            )}

            {!diffLoading && !fileDiff && (
              <div className="file-history-empty">
                Could not load diff for this commit
              </div>
            )}
          </div>
        ) : (
          <div className="file-history-list-view">
            {loading && (
              <div className="file-history-loading">Loading history...</div>
            )}

            {error && (
              <div className="file-history-error">{error}</div>
            )}

            {!loading && !error && entries.length === 0 && (
              <div className="file-history-empty">No history found for this file</div>
            )}

            {!loading && !error && entries.length > 0 && (
              <ul className="file-history-entries">
                {entries.map((entry) => (
                  <li key={entry.sha}>
                    <button
                      type="button"
                      className="file-history-entry"
                      onClick={() => onSelectEntry(entry)}
                    >
                      <div className="entry-main">
                        <span className="entry-sha">{entry.shortSha}</span>
                        <span className="entry-message">{entry.message}</span>
                      </div>
                      <div className="entry-meta">
                        <span className="entry-author">{entry.author}</span>
                        <span className="entry-date">{formatDate(entry.date)}</span>
                        <span className="entry-stats">
                          <span className="additions">+{entry.additions}</span>
                          <span className="deletions">-{entry.deletions}</span>
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
```

#### 2. Create FileHistory CSS
**File**: `web/src/components/FileHistory/FileHistory.css`
**Location**: New file

**Add**:
```css
.file-history-modal {
  width: 90vw;
  max-width: 1200px;
  height: 80vh;
  max-height: 800px;
}

.file-history {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.file-history-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
}

.file-history-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 4px 0;
}

.file-history-path {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--color-muted);
}

.file-history-list-view,
.file-history-diff-view {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.file-history-diff-header {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
}

.file-history-back {
  padding: 6px 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.file-history-back:hover {
  background: var(--color-bg-secondary);
  border-color: var(--color-text-secondary);
  color: var(--color-text);
}

.file-history-commit-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.file-history-commit-info .commit-sha {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent);
}

.file-history-commit-info .commit-message {
  font-size: 14px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.file-history-commit-info .commit-author {
  font-size: 12px;
  color: var(--color-muted);
  flex-shrink: 0;
}

.file-history-diff-content {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.file-history-entries {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow-y: auto;
  flex: 1;
}

.file-history-entry {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 12px 20px;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s;
}

.file-history-entry:hover {
  background: var(--color-bg-secondary);
}

.entry-main {
  display: flex;
  align-items: center;
  gap: 12px;
}

.entry-sha {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-accent);
  flex-shrink: 0;
}

.entry-message {
  font-size: 14px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  color: var(--color-muted);
  padding-left: 68px; /* Align with message */
}

.entry-stats {
  display: flex;
  gap: 8px;
  font-family: var(--font-mono);
}

.entry-stats .additions {
  color: var(--color-added);
}

.entry-stats .deletions {
  color: var(--color-deleted);
}

.file-history-loading,
.file-history-empty,
.file-history-error {
  padding: 40px 20px;
  text-align: center;
  color: var(--color-muted);
  font-size: 14px;
}

.file-history-error {
  color: var(--color-deleted);
}
```

#### 3. Create FileHistory Index
**File**: `web/src/components/FileHistory/index.ts`
**Location**: New file

**Add**:
```typescript
export { FileHistory } from "./FileHistory";
```

### Success Criteria

**Automated**:
```bash
cd web && bun run check
```

### Rollback
```bash
rm -rf web/src/components/FileHistory
```

---

## Phase 5: Integration

### Overview
Wire FileHistory into App.tsx and add History button to FileCard.

### Prerequisites
- [ ] Phase 4 complete

### Change Checklist
- [ ] Add useFileHistory to App.tsx
- [ ] Add history modal state
- [ ] Add History button to FileCard
- [ ] Render FileHistory modal

### Changes

#### 1. Update App.tsx - Add Hook and State
**File**: `web/src/App.tsx`
**Location**: Imports

**Add import**:
```typescript
import { useFileHistory } from "./hooks/useFileHistory";
import { FileHistory } from "./components/FileHistory";
```

**Location**: After other hooks

**Add**:
```typescript
const {
  entries: historyEntries,
  loading: historyLoading,
  error: historyError,
  selectedEntry: historySelectedEntry,
  fileDiff: historyFileDiff,
  diffLoading: historyDiffLoading,
  fetchHistory,
  selectEntry: selectHistoryEntry,
  fetchDiff: fetchHistoryDiff,
  reset: resetHistory,
} = useFileHistory(currentRepo);

const [historyFile, setHistoryFile] = useState<string | null>(null);
```

#### 2. Add History Handler
**File**: `web/src/App.tsx`
**Location**: With other handlers

**Add**:
```typescript
const handleShowHistory = useCallback(
  (filePath: string) => {
    setHistoryFile(filePath);
    void fetchHistory(filePath);
  },
  [fetchHistory]
);

const handleCloseHistory = useCallback(() => {
  setHistoryFile(null);
  resetHistory();
}, [resetHistory]);
```

#### 3. Update FileCard Props Interface
**File**: `web/src/components/FileCard.tsx`
**Location**: FileCardProps interface

**Add prop**:
```typescript
onShowHistory?: () => void;
```

#### 4. Add History Button to FileCard
**File**: `web/src/components/FileCard.tsx`
**Location**: In the file-actions div, after existing buttons

**Add**:
```typescript
{onShowHistory && (
  <button
    type="button"
    className="file-action-btn"
    onClick={(e) => {
      e.stopPropagation();
      onShowHistory();
    }}
    title="View file history"
  >
    History
  </button>
)}
```

#### 5. Pass Handler to FileCard
**File**: `web/src/App.tsx`
**Location**: In FileCard render

**Add prop**:
```typescript
onShowHistory={() => handleShowHistory(file.path)}
```

#### 6. Render FileHistory Modal
**File**: `web/src/App.tsx`
**Location**: After other modals

**Add**:
```typescript
{historyFile !== null && (
  <FileHistory
    filePath={historyFile}
    entries={historyEntries}
    loading={historyLoading}
    error={historyError}
    selectedEntry={historySelectedEntry}
    fileDiff={historyFileDiff}
    diffLoading={historyDiffLoading}
    diffStyle={diffStyle}
    onSelectEntry={selectHistoryEntry}
    onFetchDiff={(sha) => void fetchHistoryDiff(historyFile, sha)}
    onClose={handleCloseHistory}
  />
)}
```

### Success Criteria

**Automated**:
```bash
cd web && bun run check
cd mac && make build
```

**Manual**:
- [ ] History button visible on file cards
- [ ] Clicking History opens modal
- [ ] Modal shows commit list
- [ ] Selecting commit shows diff
- [ ] Back button returns to list
- [ ] Close button closes modal
- [ ] Works in all modes (local, branch, pr, commit)

### Rollback
```bash
git restore -- web/src/App.tsx web/src/components/FileCard.tsx
```

---

## Testing Strategy

### Manual Testing Checklist
1. [ ] Open history for a file with many commits
2. [ ] Open history for a recently created file (few commits)
3. [ ] Open history for a renamed file (verify --follow works)
4. [ ] Select commit, verify diff displays correctly
5. [ ] Back button returns to list
6. [ ] Close modal via X button
7. [ ] Close modal via Escape key
8. [ ] Test in each mode (local, branch, pr, commit)

## Deployment Instructions

```bash
cd mac && make build
cp -r mac/release/Cerebro.app /Applications/
cp dist-exe/cerebro ~/.local/bin/cerebro
```

## Open Questions
- [ ] Should history button be visible for untracked files? → Suggest: No (no history)
- [ ] Should we add keyboard shortcut to open history? → Suggest: Defer to later

## References
- Modal pattern: `web/src/components/Modal.tsx`
- DiffView: `web/src/components/DiffView.tsx`
- FileCard: `web/src/components/FileCard.tsx`
