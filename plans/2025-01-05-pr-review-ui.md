# PR Review UI Implementation Plan

## Plan Metadata
- Created: 2025-01-05
- Status: draft
- Owner: yesh
- Assumptions:
  - `gh` CLI is installed and authenticated
  - Backend PR endpoints already exist (`/api/prs`, `/api/diff?mode=pr&pr=N`, `/api/pr/review`)
  - No GitHub comments integration (local-only for now)

## Progress Tracking
- [x] Phase 1: Backend - Add PR list filters
- [x] Phase 2: Types & API - Frontend type updates
- [x] Phase 3: Hook - Create usePRs hook
- [x] Phase 4: Components - PR picker UI
- [x] Phase 5: Integration - Wire into App + Header
- [x] Phase 6: Actions - Approve/Comment/Request Changes UI

## Overview
Add PR review mode to Cerebro UI. Users can:
1. Switch to "PRs" mode (third mode after Branch/Working)
2. Filter PRs by: My PRs, Review Requested, All Open
3. Select a PR to view its diff (fetched from GitHub, no local checkout)
4. Approve, Comment, or Request Changes directly from the UI

## Current State

### Backend (already implemented)
- `GET /api/prs` - lists all open PRs
- `GET /api/diff?mode=pr&pr=<number>` - returns PR diff in FileDiff format
- `POST /api/pr/review` - approve/comment/request-changes

### Frontend
- `useDiff` hook has `DiffMode = "branch" | "working"` (needs "pr" added)
- Header has mode switcher with two buttons
- No PR-related UI exists

### Key Discoveries
- `web/src/hooks/useDiff.ts:5` - Local DiffMode type excludes "pr"
- `web/src/components/Header/Header.tsx:17` - Mode prop typed as `"branch" | "working"`
- `src/types/index.ts:20` - Backend DiffMode already includes "pr"
- `src/github/index.ts:89` - `listPRs()` has no filter support

## Desired End State

### User Flow
1. Click "PRs" in mode switcher
2. See tabs: `[My PRs] [Review Requested] [All Open]`
3. See list of PRs matching selected filter
4. Click a PR → loads diff in existing FileCard list
5. Header shows PR info + action buttons
6. Click Approve/Comment/Request Changes → submits review to GitHub

### Verification
```bash
# Start app, navigate to PR mode
open http://localhost:3030

# API should support filters
curl "http://localhost:3030/api/prs?filter=mine"
curl "http://localhost:3030/api/prs?filter=review-requested"
curl "http://localhost:3030/api/prs?filter=all"
```

## Out of Scope
- Line-level GitHub comments (future work)
- PR creation/editing
- Merging PRs
- CI status display
- Draft PR handling

## Breaking Changes
None - additive only.

## Dependency and Configuration Changes
None required.

## Error Handling Strategy
- If `gh` not authenticated: show banner "GitHub authentication required. Run `gh auth login`"
- If no PRs found: show empty state with filter name
- If PR fetch fails: show error inline, allow retry
- All errors should be dismissible

## Implementation Approach

**Why this approach:**
- Reuse existing diff rendering infrastructure (FileCard, DiffView)
- PR mode is a "source" of diff data, not a separate view
- Minimal new components (PRPicker, PRActions)
- Filter tabs are simple state, not a complex search UI

**Alternatives rejected:**
- Separate PR review screen: duplicates too much UI
- Command palette only: not discoverable enough for primary workflow

## Phase Dependencies and Parallelization
- Phase 1 (Backend) and Phase 2 (Types) can run in parallel
- Phase 3 depends on Phase 2
- Phase 4 depends on Phase 3
- Phase 5 depends on Phase 4
- Phase 6 depends on Phase 5

---

## Phase 1: Backend - Add PR List Filters

### Overview
Add filter parameter to `/api/prs` endpoint to support "mine", "review-requested", "all".

### Prerequisites
- [ ] None

### Change Checklist
- [ ] Update `listPRs()` in github module to accept filter
- [ ] Update `/api/prs` handler to pass filter
- [ ] Add filter type to schemas

### Changes

#### 1. GitHub Module - Add Filter Support
**File**: `src/github/index.ts`
**Location**: lines 89-101

**Before**:
```typescript
/**
 * List open pull requests for a repository
 */
export async function listPRs(repoPath: string): Promise<PullRequest[]> {
  const prs = await ghJson<PullRequest[]>(
    [
      "pr",
      "list",
      "--json",
      "number,title,headRefName,baseRefName,author,createdAt,url,state,additions,deletions,changedFiles,body",
    ],
    repoPath
  );
  return prs;
}
```

**After**:
```typescript
export type PRFilter = "all" | "mine" | "review-requested";

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
```

**Why**: Enable frontend to request specific PR subsets.

#### 2. PR Handler - Accept Filter Parameter
**File**: `src/server/handlers/pr.ts`
**Location**: lines 10-27

**Before**:
```typescript
export async function handleGetPRs(url: URL): Promise<Response> {
  const repoId = url.searchParams.get("repo");
  const repo = repoId ? await state.getRepo(repoId) : await state.getCurrentRepo();

  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  try {
    const prs = await github.listPRs(repo.path);
    return Response.json({ prs, repo_path: repo.path });
```

**After**:
```typescript
export async function handleGetPRs(url: URL): Promise<Response> {
  const repoId = url.searchParams.get("repo");
  const repo = repoId ? await state.getRepo(repoId) : await state.getCurrentRepo();

  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }

  const filterParam = url.searchParams.get("filter");
  const filter: github.PRFilter =
    filterParam === "mine" || filterParam === "review-requested"
      ? filterParam
      : "all";

  try {
    const prs = await github.listPRs(repo.path, filter);
    return Response.json({ prs, repo_path: repo.path, filter });
```

**Why**: Pass filter from query param to github module.

### Success Criteria

**Automated**:
```bash
# From repo root:
bun run check
```

**Manual**:
```bash
# Test each filter
curl -s "http://localhost:3030/api/prs?filter=all" | jq '.prs | length'
curl -s "http://localhost:3030/api/prs?filter=mine" | jq '.filter'
curl -s "http://localhost:3030/api/prs?filter=review-requested" | jq '.filter'
```

### Rollback
```bash
git restore -- src/github/index.ts src/server/handlers/pr.ts
```

---

## Phase 2: Types & API - Frontend Type Updates

### Overview
Update frontend types to include PR mode and PR-related interfaces.

### Prerequisites
- [ ] None (can run parallel with Phase 1)

### Change Checklist
- [ ] Export PullRequest type from backend
- [ ] Update frontend api/types.ts
- [ ] Add PR-specific response types

### Changes

#### 1. Move PullRequest Type to Shared Types
**File**: `src/types/index.ts`
**Location**: end of file

**Add**:
```typescript
// Pull Request types (moved from src/github/index.ts)
export interface PullRequest {
  number: number;
  title: string;
  headRefName: string;
  baseRefName: string;
  author: { login: string };
  createdAt: string;
  url: string;
  state: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  body: string;
}

export type PRFilter = "all" | "mine" | "review-requested";
```

**Why**: Share types between backend and frontend via @cerebro/types.

#### 2. Update GitHub Module to Import Shared Type
**File**: `src/github/index.ts`
**Location**: top of file (imports) and remove local interface

**Before** (around line 1-15):
```typescript
export interface PullRequest {
  number: number;
  title: string;
  headRefName: string;
  baseRefName: string;
  author: { login: string };
  createdAt: string;
  url: string;
  state: string;
  additions: number;
  deletions: number;
  changedFiles: number;
  body: string;
}
```

**After**:
```typescript
import type { PullRequest } from "../types";

// Re-export for convenience
export type { PullRequest };
```

**Why**: Single source of truth for PullRequest type.

#### 3. Update Frontend Types
**File**: `web/src/api/types.ts`
**Location**: lines 6-14

**Before**:
```typescript
export type {
  FileContents,
  FileDiff,
  DiffMode,
  DiffResponse,
  StatusResponse,
  Comment,
  Note,
  Repository,
} from "@cerebro/types";
```

**After**:
```typescript
export type {
  FileContents,
  FileDiff,
  DiffMode,
  DiffResponse,
  StatusResponse,
  Comment,
  Note,
  Repository,
  PullRequest,
  PRFilter,
} from "@cerebro/types";

// PR list response (uses exported PullRequest type)
export interface PRsResponse {
  prs: PullRequest[];
  repo_path: string;
  filter: PRFilter;
}
```

**Why**: Enable type-safe PR handling in frontend. Uses locally re-exported types to avoid dynamic imports.

### Success Criteria

**Automated**:
```bash
# From repo root:
bun run check
cd web && bun run check
```

### Rollback
```bash
git restore -- src/types/index.ts web/src/api/types.ts
```

---

## Phase 3: Hook - Create usePRs Hook

### Overview
Create a dedicated hook for fetching and managing PR list state.

### Prerequisites
- [ ] Phase 2 complete (types available)

### Change Checklist
- [ ] Create usePRs.ts hook
- [ ] Handle loading, error, filter state
- [ ] Provide PR selection capability
- [ ] Update useDiff: DiffMode type, prNumber state
- [ ] Update useDiff: getCacheKey for PR mode
- [ ] Update useDiff: fetchData skip logic and PR params
- [ ] Update useDiff: loadFileDiff PR support

### Changes

#### 1. Create usePRs Hook
**File**: `web/src/hooks/usePRs.ts`
**Location**: new file

**Add**:
```typescript
import { useCallback, useEffect, useState } from "react";
import type { PullRequest, PRFilter, PRsResponse } from "../api/types";

interface UsePRsResult {
  prs: PullRequest[];
  loading: boolean;
  error: string | null;
  filter: PRFilter;
  setFilter: (filter: PRFilter) => void;
  selectedPR: number | null;
  setSelectedPR: (pr: number | null) => void;
  refresh: () => Promise<void>;
}

export function usePRs(repoId?: string | null): UsePRsResult {
  const [prs, setPRs] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PRFilter>("all");
  const [selectedPR, setSelectedPR] = useState<number | null>(null);

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

  const fetchPRs = useCallback(async () => {
    if (!repoId) {
      setPRs([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(buildUrl("/api/prs", { filter }));
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to fetch PRs");
      }
      const data = (await res.json()) as PRsResponse;
      setPRs(data.prs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch PRs");
      setPRs([]);
    } finally {
      setLoading(false);
    }
  }, [repoId, filter, buildUrl]);

  useEffect(() => {
    void fetchPRs();
  }, [fetchPRs]);

  // Clear selection when filter changes
  useEffect(() => {
    setSelectedPR(null);
  }, [filter]);

  return {
    prs,
    loading,
    error,
    filter,
    setFilter,
    selectedPR,
    setSelectedPR,
    refresh: fetchPRs,
  };
}
```

**Why**: Encapsulate PR fetching logic, separate from diff logic.

#### 2. Update useDiff to Support PR Mode
**File**: `web/src/hooks/useDiff.ts`

##### 2a. Update DiffMode type
**Location**: line 5

**Before**:
```typescript
type DiffMode = "branch" | "working";
```

**After**:
```typescript
type DiffMode = "branch" | "working" | "pr";
```

##### 2b. Add prNumber to interface
**Location**: lines 23-24 (add to UseDiffResult interface)

**Before**:
```typescript
  compareBranch: string | null;
  setCompareBranch: (branch: string | null) => void;
```

**After**:
```typescript
  compareBranch: string | null;
  setCompareBranch: (branch: string | null) => void;
  prNumber: number | null;
  setPrNumber: (pr: number | null) => void;
```

##### 2c. Add prNumber state
**Location**: line 52 (add after compareBranch state)

**Add**:
```typescript
  const [prNumber, setPrNumber] = useState<number | null>(null);
```

##### 2d. Update getCacheKey to handle PR mode
**Location**: around line 41 (getCacheKey function)

**Before**:
```typescript
function getCacheKey(mode: DiffMode, compareBranch: string | null): string {
  return mode === "branch" ? `branch:${compareBranch ?? "default"}` : mode;
}
```

**After**:
```typescript
function getCacheKey(mode: DiffMode, compareBranch: string | null, prNumber: number | null): string {
  if (mode === "pr") return `pr:${prNumber ?? "none"}`;
  return mode === "branch" ? `branch:${compareBranch ?? "default"}` : mode;
}
```

##### 2e. Update fetchData to handle PR mode
**Location**: inside fetchData function (around line 75-95)

**Before**:
```typescript
    async (currentMode: DiffMode, currentCompareBranch: string | null, background = false) => {
      if (!repoId) {
        setLoading(false);
        setDiff(null);
        return;
      }

      const cacheKey = getCacheKey(currentMode, currentCompareBranch);
```

**After**:
```typescript
    async (currentMode: DiffMode, currentCompareBranch: string | null, currentPrNumber: number | null, background = false) => {
      if (!repoId) {
        setLoading(false);
        setDiff(null);
        return;
      }

      // Skip fetch if PR mode but no PR selected
      if (currentMode === "pr" && !currentPrNumber) {
        setLoading(false);
        setDiff(null);
        return;
      }

      const cacheKey = getCacheKey(currentMode, currentCompareBranch, currentPrNumber);
```

**Location**: inside fetchData, modify diff params (around line 100)

**Before**:
```typescript
        const diffParams: Record<string, string> = { mode: currentMode };
        if (currentCompareBranch) {
          diffParams.compare = currentCompareBranch;
        }
```

**After**:
```typescript
        const diffParams: Record<string, string> = { mode: currentMode };
        if (currentMode === "pr" && currentPrNumber) {
          diffParams.pr = String(currentPrNumber);
        } else if (currentCompareBranch) {
          diffParams.compare = currentCompareBranch;
        }
```

##### 2f. Update fetchData calls to pass prNumber
**Location**: useEffect that calls fetchData (around line 160)

**Before**:
```typescript
  useEffect(() => {
    void fetchData(mode, compareBranch);
  }, [mode, compareBranch, fetchData]);
```

**After**:
```typescript
  useEffect(() => {
    void fetchData(mode, compareBranch, prNumber);
  }, [mode, compareBranch, prNumber, fetchData]);
```

**Location**: background refresh interval (around line 170)

**Before**:
```typescript
      void fetchData(mode, compareBranch, true);
```

**After**:
```typescript
      void fetchData(mode, compareBranch, prNumber, true);
```

**Location**: refresh callback (around line 180)

**Before**:
```typescript
  const refresh = useCallback(
    () => fetchData(mode, compareBranch),
    [mode, compareBranch, fetchData],
  );
```

**After**:
```typescript
  const refresh = useCallback(
    () => fetchData(mode, compareBranch, prNumber),
    [mode, compareBranch, prNumber, fetchData],
  );
```

##### 2g. Update loadFileDiff to support PR mode
**Location**: loadFileDiff function (around line 190)

**Before**:
```typescript
  const loadFileDiff = useCallback(
    async (filePath: string): Promise<FileDiff | null> => {
      try {
        const params: Record<string, string> = { mode, file: filePath };
        if (compareBranch) {
          params.compare = compareBranch;
        }
```

**After**:
```typescript
  const loadFileDiff = useCallback(
    async (filePath: string): Promise<FileDiff | null> => {
      try {
        const params: Record<string, string> = { mode, file: filePath };
        if (mode === "pr" && prNumber) {
          params.pr = String(prNumber);
        } else if (compareBranch) {
          params.compare = compareBranch;
        }
```

**Update dependency array**:
```typescript
  }, [mode, buildUrl, compareBranch, prNumber]);
```

##### 2h. Update return object
**Location**: return statement (around line 300)

**Add to return**:
```typescript
    prNumber,
    setPrNumber,
```

**Why**: Enable diff hook to fetch PR diffs when in PR mode. Properly handles cache keys per PR, skips fetch when no PR selected, and supports file-level diff loading for PRs.

### Success Criteria

**Automated**:
```bash
cd web
bun run check
```

### Rollback
```bash
git restore -- web/src/hooks/useDiff.ts
rm web/src/hooks/usePRs.ts
```

---

## Phase 4: Components - PR Picker UI

### Overview
Create PRPicker component with filter tabs and PR list.

### Prerequisites
- [ ] Phase 3 complete (usePRs hook exists)

### Change Checklist
- [ ] Create PRPicker component
- [ ] Create PRPicker.css styles
- [ ] Add filter tabs UI
- [ ] Add PR list with selection

### Changes

#### 1. Create PRPicker Component
**File**: `web/src/components/PRPicker/PRPicker.tsx`
**Location**: new file

**Add**:
```typescript
import type { PullRequest, PRFilter } from "../../api/types";
import "./PRPicker.css";

interface PRPickerProps {
  prs: PullRequest[];
  loading: boolean;
  error: string | null;
  filter: PRFilter;
  selectedPR: number | null;
  onFilterChange: (filter: PRFilter) => void;
  onSelectPR: (pr: number) => void;
  onRefresh: () => void;
}

const FILTER_LABELS: Record<PRFilter, string> = {
  mine: "My PRs",
  "review-requested": "Review Requested",
  all: "All Open",
};

export function PRPicker({
  prs,
  loading,
  error,
  filter,
  selectedPR,
  onFilterChange,
  onSelectPR,
  onRefresh,
}: PRPickerProps) {
  return (
    <div className="pr-picker">
      <div className="pr-filter-tabs">
        {(Object.keys(FILTER_LABELS) as PRFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            className={`pr-filter-tab ${filter === f ? "active" : ""}`}
            onClick={() => onFilterChange(f)}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      {error && (
        <div className="pr-error">
          <span>{error}</span>
          <button type="button" onClick={onRefresh}>
            Retry
          </button>
        </div>
      )}

      {loading && <div className="pr-loading">Loading PRs...</div>}

      {!loading && !error && prs.length === 0 && (
        <div className="pr-empty">
          No {FILTER_LABELS[filter].toLowerCase()} found
        </div>
      )}

      {!loading && !error && prs.length > 0 && (
        <ul className="pr-list">
          {prs.map((pr) => (
            <li key={pr.number}>
              <button
                type="button"
                className={`pr-item ${selectedPR === pr.number ? "selected" : ""}`}
                onClick={() => onSelectPR(pr.number)}
              >
                <span className="pr-number">#{pr.number}</span>
                <span className="pr-title">{pr.title}</span>
                <span className="pr-meta">
                  {pr.headRefName} → {pr.baseRefName}
                </span>
                <span className="pr-stats">
                  <span className="pr-additions">+{pr.additions}</span>
                  <span className="pr-deletions">-{pr.deletions}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

#### 2. Create PRPicker Styles
**File**: `web/src/components/PRPicker/PRPicker.css`
**Location**: new file

**Add**:
```css
.pr-picker {
  margin-bottom: 16px;
}

.pr-filter-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius);
  padding: 3px;
  width: fit-content;
}

.pr-filter-tab {
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--color-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 5px;
}

.pr-filter-tab.active {
  background: var(--color-bg-secondary);
  color: var(--color-text);
}

.pr-filter-tab:hover:not(.active) {
  color: var(--color-text-secondary);
}

.pr-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 300px;
  overflow-y: auto;
}

.pr-item {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 12px;
  align-items: center;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s;
}

.pr-item:hover {
  border-color: var(--color-accent);
  background: var(--color-bg-tertiary);
}

.pr-item.selected {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}

.pr-number {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent);
}

.pr-title {
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pr-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--color-muted);
}

.pr-stats {
  display: flex;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
}

.pr-additions {
  color: var(--color-added);
}

.pr-deletions {
  color: var(--color-deleted);
}

.pr-loading,
.pr-empty {
  padding: 24px;
  text-align: center;
  color: var(--color-muted);
  font-size: 13px;
}

.pr-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: color-mix(in srgb, var(--color-deleted) 10%, transparent);
  border: 1px solid var(--color-deleted);
  border-radius: var(--radius);
  margin-bottom: 12px;
}

.pr-error span {
  color: var(--color-deleted);
  font-size: 13px;
}

.pr-error button {
  padding: 4px 8px;
  border: 1px solid var(--color-deleted);
  background: transparent;
  color: var(--color-deleted);
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
}
```

#### 3. Create Index Export
**File**: `web/src/components/PRPicker/index.ts`
**Location**: new file

**Add**:
```typescript
export { PRPicker } from "./PRPicker";
```

### Success Criteria

**Automated**:
```bash
cd web
bun run check
```

### Rollback
```bash
rm -rf web/src/components/PRPicker
```

---

## Phase 5: Integration - Wire into App + Header

### Overview
Integrate PR mode into main App component and Header.

### Prerequisites
- [ ] Phase 4 complete (PRPicker exists)

### Change Checklist
- [ ] Update Header to support "pr" mode
- [ ] Add PRPicker to App.tsx
- [ ] Wire usePRs hook to useDiff
- [ ] Handle mode switching

### Changes

#### 1. Update Header Props and UI
**File**: `web/src/components/Header/Header.tsx`
**Location**: lines 7-17 (interface)

**Before**:
```typescript
interface HeaderProps {
  repos: Repository[];
  currentRepo: string | null;
  diff: DiffResponse | null;
  mode: "branch" | "working";
  diffStyle: "split" | "unified";
  // ... other props ...
  onModeChange: (mode: "branch" | "working") => void;
```

**After**:
```typescript
interface HeaderProps {
  repos: Repository[];
  currentRepo: string | null;
  diff: DiffResponse | null;
  mode: "branch" | "working" | "pr";
  diffStyle: "split" | "unified";
  // ... other props ...
  onModeChange: (mode: "branch" | "working" | "pr") => void;
```

**Why**: Both `mode` prop and `onModeChange` callback must accept `"pr"` as valid value.

**Location**: lines 64-78 (mode switcher buttons)

**Before**:
```typescript
        <div className="mode-switcher">
          <button
            type="button"
            className={mode === "branch" ? "active" : ""}
            onClick={() => onModeChange("branch")}
          >
            Branch
          </button>
          <button
            type="button"
            className={mode === "working" ? "active" : ""}
            onClick={() => onModeChange("working")}
          >
            Working
          </button>
        </div>
```

**After**:
```typescript
        <div className="mode-switcher">
          <button
            type="button"
            className={mode === "branch" ? "active" : ""}
            onClick={() => onModeChange("branch")}
          >
            Branch
          </button>
          <button
            type="button"
            className={mode === "working" ? "active" : ""}
            onClick={() => onModeChange("working")}
          >
            Working
          </button>
          <button
            type="button"
            className={mode === "pr" ? "active" : ""}
            onClick={() => onModeChange("pr")}
          >
            PRs
          </button>
        </div>
```

**Location**: after branch display (around line 80), add PR info display

**After** the existing branch/commit display logic:
```typescript
        {mode === "pr" && diff?.pr_number && (
          <span className="pr-info">
            <span className="pr-badge">#{diff.pr_number}</span>
            <span className="pr-title-header">{diff.pr_title}</span>
          </span>
        )}
```

**Why**: Add third mode button and display PR info when in PR mode.

#### 2. Update Header CSS
**File**: `web/src/components/Header/Header.css`
**Location**: end of file

**Add**:
```css
/* PR Info */
.pr-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pr-badge {
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--color-accent);
}

.pr-title-header {
  font-size: 13px;
  color: var(--color-text-secondary);
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

#### 3. Update App.tsx - Add PR State and Integration
**File**: `web/src/App.tsx`
**Location**: imports (top of file)

**Add import**:
```typescript
import { PRPicker } from "./components/PRPicker";
import { usePRs } from "./hooks/usePRs";
```

**Location**: after useDiff hook call (around line 30)

**Add**:
```typescript
  const {
    prs,
    loading: prsLoading,
    error: prsError,
    filter: prFilter,
    setFilter: setPrFilter,
    selectedPR,
    setSelectedPR,
    refresh: refreshPRs,
  } = usePRs(currentRepo);
```

**Location**: add effect to sync selectedPR with useDiff (after existing effects, around line 50)

**Add**:
```typescript
  // Sync PR selection with diff hook
  useEffect(() => {
    if (mode === "pr" && selectedPR) {
      setPrNumber(selectedPR);
    }
  }, [mode, selectedPR, setPrNumber]);

  // Clear PR selection when leaving PR mode
  useEffect(() => {
    if (mode !== "pr") {
      setSelectedPR(null);
    }
  }, [mode, setSelectedPR]);
```

**Location**: in the main return, after Progress component (around line 290)

**Add**:
```typescript
      {mode === "pr" && (
        <PRPicker
          prs={prs}
          loading={prsLoading}
          error={prsError}
          filter={prFilter}
          selectedPR={selectedPR}
          onFilterChange={setPrFilter}
          onSelectPR={(pr) => {
            setSelectedPR(pr);
          }}
          onRefresh={() => void refreshPRs()}
        />
      )}
```

**Location**: Update Header onModeChange prop type (around line 275)

**Before**:
```typescript
        onModeChange={setMode}
```

This should still work since setMode now accepts "pr" as well (from Phase 3).

### Success Criteria

**Automated**:
```bash
cd web
bun run check
```

**Manual**:
1. Start app, click "PRs" button - should show filter tabs
2. Select a filter - should show PRs or empty state
3. Click a PR - should load diff below

### Rollback
```bash
git restore -- web/src/components/Header/Header.tsx web/src/components/Header/Header.css web/src/App.tsx
```

---

## Phase 6: Actions - Approve/Comment/Request Changes UI

### Overview
Add action buttons for PR review submission.

### Prerequisites
- [ ] Phase 5 complete (PR mode works)

### Change Checklist
- [ ] Create PRActions component
- [ ] Add review submission API call
- [ ] Wire into Header or create floating action bar
- [ ] Add confirmation/success feedback

### Changes

#### 1. Create PRActions Component
**File**: `web/src/components/PRActions/PRActions.tsx`
**Location**: new file

**Add**:
```typescript
import { useState } from "react";
import "./PRActions.css";

interface PRActionsProps {
  prNumber: number;
  repoId: string;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
}

type ReviewAction = "approve" | "comment" | "request-changes";

export function PRActions({ prNumber, repoId, onSuccess, onError }: PRActionsProps) {
  const [loading, setLoading] = useState(false);
  const [showCommentModal, setShowCommentModal] = useState<ReviewAction | null>(null);
  const [comment, setComment] = useState("");

  const submitReview = async (action: ReviewAction, body?: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pr/review?repo=${repoId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pr: prNumber, action, body }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to submit review");
      }

      const data = await res.json();
      onSuccess(data.message);
      setShowCommentModal(null);
      setComment("");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = () => {
    void submitReview("approve");
  };

  const handleComment = () => {
    setShowCommentModal("comment");
  };

  const handleRequestChanges = () => {
    setShowCommentModal("request-changes");
  };

  const handleSubmitWithComment = () => {
    if (!showCommentModal || !comment.trim()) return;
    void submitReview(showCommentModal, comment);
  };

  return (
    <div className="pr-actions">
      <button
        type="button"
        className="pr-action-btn approve"
        onClick={handleApprove}
        disabled={loading}
      >
        ✓ Approve
      </button>
      <button
        type="button"
        className="pr-action-btn comment"
        onClick={handleComment}
        disabled={loading}
      >
        Comment
      </button>
      <button
        type="button"
        className="pr-action-btn request-changes"
        onClick={handleRequestChanges}
        disabled={loading}
      >
        Request Changes
      </button>

      {showCommentModal && (
        <div className="pr-comment-modal-overlay" onClick={() => setShowCommentModal(null)}>
          <div className="pr-comment-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {showCommentModal === "comment" ? "Add Comment" : "Request Changes"}
            </h3>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write your review comment..."
              rows={5}
              autoFocus
            />
            <div className="pr-comment-modal-actions">
              <button
                type="button"
                className="cancel"
                onClick={() => setShowCommentModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="submit"
                onClick={handleSubmitWithComment}
                disabled={!comment.trim() || loading}
              >
                {loading ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

#### 2. Create PRActions Styles
**File**: `web/src/components/PRActions/PRActions.css`
**Location**: new file

**Add**:
```css
.pr-actions {
  display: flex;
  gap: 8px;
}

.pr-action-btn {
  padding: 6px 12px;
  border-radius: var(--radius);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.pr-action-btn.approve {
  background: color-mix(in srgb, var(--color-added) 15%, transparent);
  border: 1px solid var(--color-added);
  color: var(--color-added);
}

.pr-action-btn.approve:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-added) 25%, transparent);
}

.pr-action-btn.comment {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.pr-action-btn.comment:hover:not(:disabled) {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.pr-action-btn.request-changes {
  background: transparent;
  border: 1px solid var(--color-deleted);
  color: var(--color-deleted);
}

.pr-action-btn.request-changes:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-deleted) 15%, transparent);
}

.pr-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Comment Modal */
.pr-comment-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.pr-comment-modal {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 20px;
  width: 90%;
  max-width: 500px;
}

.pr-comment-modal h3 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
}

.pr-comment-modal textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  font-family: inherit;
  font-size: 14px;
  resize: vertical;
}

.pr-comment-modal textarea:focus {
  outline: none;
  border-color: var(--color-accent);
}

.pr-comment-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.pr-comment-modal-actions button {
  padding: 8px 16px;
  border-radius: var(--radius);
  font-size: 13px;
  cursor: pointer;
}

.pr-comment-modal-actions .cancel {
  background: transparent;
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}

.pr-comment-modal-actions .submit {
  background: var(--color-accent);
  border: none;
  color: white;
}

.pr-comment-modal-actions .submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

#### 3. Create Index Export
**File**: `web/src/components/PRActions/index.ts`
**Location**: new file

**Add**:
```typescript
export { PRActions } from "./PRActions";
```

#### 4. Add PRActions to Header
**File**: `web/src/components/Header/Header.tsx`
**Location**: imports

**Add**:
```typescript
import { PRActions } from "../PRActions";
```

**Location**: interface (add new props)

**Add to HeaderProps**:
```typescript
  onPRReviewSuccess?: (message: string) => void;
  onPRReviewError?: (error: string) => void;
```

**Location**: in header-right div, before view-toggle (around line 110)

**Add**:
```typescript
        {mode === "pr" && diff?.pr_number && currentRepo && (
          <PRActions
            prNumber={diff.pr_number}
            repoId={currentRepo}
            onSuccess={onPRReviewSuccess ?? (() => {})}
            onError={onPRReviewError ?? (() => {})}
          />
        )}
```

#### 5. Wire Up in App.tsx
**File**: `web/src/App.tsx`
**Location**: add state for notifications (after other useState calls)

**Add**:
```typescript
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Auto-dismiss notifications
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);
```

**Location**: Header component props

**Add**:
```typescript
        onPRReviewSuccess={(msg) => setNotification({ type: "success", message: msg })}
        onPRReviewError={(msg) => setNotification({ type: "error", message: msg })}
```

**Location**: after Header, before Progress

**Add**:
```typescript
      {notification && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
          <button type="button" onClick={() => setNotification(null)}>×</button>
        </div>
      )}
```

#### 6. Add Notification Styles
**File**: `web/src/index.css`
**Location**: end of file (after existing styles)

**Add**:
```css
.notification {
  position: fixed;
  top: 16px;
  right: 16px;
  padding: 12px 16px;
  border-radius: var(--radius);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 1000;
  animation: slideIn 0.2s ease-out;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.notification.success {
  background: color-mix(in srgb, var(--color-added) 15%, var(--color-bg-secondary));
  border: 1px solid var(--color-added);
  color: var(--color-added);
}

.notification.error {
  background: color-mix(in srgb, var(--color-deleted) 15%, var(--color-bg-secondary));
  border: 1px solid var(--color-deleted);
  color: var(--color-deleted);
}

.notification button {
  background: none;
  border: none;
  color: inherit;
  font-size: 18px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}
```

### Success Criteria

**Automated**:
```bash
cd web
bun run check
```

**Manual**:
1. Select a PR in PR mode
2. Click Approve → should show success notification
3. Click Comment → should show modal, submit comment
4. Click Request Changes → should show modal, submit with body

### Rollback
```bash
rm -rf web/src/components/PRActions
git restore -- web/src/components/Header/Header.tsx web/src/App.tsx
```

---

## Testing Strategy

### Manual Testing Checklist
1. [ ] Switch to PR mode - filter tabs appear
2. [ ] Each filter shows appropriate PRs (or empty state)
3. [ ] Selecting PR loads diff in FileCard list
4. [ ] Diff renders correctly (same as branch mode)
5. [ ] Approve button works (check GitHub)
6. [ ] Comment modal opens and submits
7. [ ] Request Changes modal opens and submits
8. [ ] Error states display correctly
9. [ ] Notifications appear and auto-dismiss
10. [ ] Keyboard nav still works in PR mode (j/k/v/etc)

### Error Scenarios to Test
- [ ] No GitHub auth → shows auth error
- [ ] No PRs in filter → shows empty state
- [ ] Network error fetching PRs → shows error with retry
- [ ] Review submission fails → shows error notification

## Deployment Instructions

```bash
# Build and deploy
# From repo root:
bun run build
cd mac && make build
cp -r mac/release/Cerebro.app /Applications/
cp dist-exe/cerebro ~/.local/bin/cerebro
```

## Anti-Patterns to Avoid
- Don't duplicate diff rendering logic - reuse FileCard entirely
- Don't store PR data in useDiff - keep usePRs separate
- Don't make review buttons visible when no PR selected

## Open Questions
- [x] Line-level GitHub comments? → Answer: Out of scope for this plan
- [x] Show CI status? → Answer: Out of scope for this plan
- [x] Cache PR list? → Answer: No caching for now, always fresh fetch

## References
- Backend PR implementation: `src/github/index.ts`
- Existing mode switcher: `web/src/components/Header/Header.tsx:64-78`
- useDiff hook: `web/src/hooks/useDiff.ts`
