# Compare Against Any Branch

## Overview
Allow users to compare current branch against any branch by clicking the "vs {branch}" hint to open a branch picker.

## Current State
- `baseBranch` stored per-repo in DB (`src/state/index.ts:addRepo`)
- Git layer already supports any base branch: `getDiff({ baseBranch, mode })` (`src/git/index.ts:88`)
- UI shows static "vs {baseBranch}" hint (`web/src/App.tsx:mode-switcher`)
- No API to list available branches

## Desired End State
- Clicking "vs main" opens a dropdown with all local branches
- Selecting a branch re-fetches diff against that branch
- Selection persists during session (not saved to DB)
- Default remains repo's configured baseBranch

## Out of Scope
- Remote branches (only local)
- Persisting selection to database
- Comparing two arbitrary refs (tags, commits)

---

## Phase 1: Backend ✅

### Overview
Add branches list endpoint and accept compare branch parameter in diff API.

### Changes

#### Add branches endpoint
**File**: `src/git/index.ts`

Add to GitManager interface and implementation:
```typescript
// In interface (line ~11)
getBranches(): Promise<string[]>;

// In createGitManager (after getCurrentCommit)
async getBranches(): Promise<string[]> {
  const branches = await git.branchLocal();
  return branches.all;
}
```

#### Add API route
**File**: `src/server/index.ts`

```typescript
// Add route (after /api/diff routes)
if (path === "/api/branches" && method === "GET") {
  return handleGetBranches(url);
}

// Add handler
async function handleGetBranches(url: URL): Promise<Response> {
  const repo = await getCurrentRepoFromRequest(url);
  if (!repo) {
    return Response.json({ error: "No repository selected" }, { status: 400 });
  }
  const git = getGitManager(repo.path);
  const branches = await git.getBranches();
  return Response.json({ branches });
}
```

#### Accept compare param in diff endpoint
**File**: `src/server/index.ts`

Update `handleGetDiff`:
```typescript
const compareBranch = url.searchParams.get("compare") || repo.baseBranch;
const diff = await git.getDiff({ baseBranch: compareBranch, mode });
```

### Success Criteria
- `curl localhost:3030/api/branches?repo=X` returns branch list
- `curl localhost:3030/api/diff?repo=X&mode=branch&compare=develop` compares against develop

---

## Phase 2: Frontend ✅

### Overview
Add clickable branch selector dropdown to mode switcher.

### Changes

#### Add branches fetch to useDiff hook
**File**: `web/src/hooks/useDiff.ts`

```typescript
// Add state
const [branches, setBranches] = useState<string[]>([]);
const [compareBranch, setCompareBranch] = useState<string | null>(null);

// Fetch branches once on mount
useEffect(() => {
  if (!repoId) return;
  fetch(buildUrl("/api/branches"))
    .then(res => res.json())
    .then(data => setBranches(data.branches || []))
    .catch(() => {});
}, [repoId, buildUrl]);

// Update diff fetch to include compare param
const fetches: Promise<Response>[] = [
  fetch(buildUrl("/api/diff", { 
    mode: currentMode,
    ...(compareBranch && { compare: compareBranch })
  })),
  // ...
];

// Return branches, compareBranch, setCompareBranch
```

#### Add branch picker UI
**File**: `web/src/App.tsx`

```tsx
const [showBranchPicker, setShowBranchPicker] = useState(false);

// In mode-switcher, replace static hint:
{mode === "branch" && (
  <span 
    className="mode-hint clickable"
    onClick={(e) => {
      e.stopPropagation();
      setShowBranchPicker(!showBranchPicker);
    }}
  >
    vs {compareBranch || currentRepoData?.baseBranch}
  </span>
)}
{showBranchPicker && (
  <div className="branch-picker">
    {branches.map(b => (
      <button
        key={b}
        className={b === (compareBranch || currentRepoData?.baseBranch) ? "active" : ""}
        onClick={() => {
          setCompareBranch(b);
          setShowBranchPicker(false);
        }}
      >
        {b}
      </button>
    ))}
  </div>
)}
```

#### Styling
**File**: `web/src/index.css`

```css
.mode-hint.clickable {
  cursor: pointer;
  border-bottom: 1px dashed var(--color-muted);
}

.mode-hint.clickable:hover {
  color: var(--color-text);
}

.branch-picker {
  position: absolute;
  top: 100%;
  left: 0;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 4px;
  z-index: 100;
  max-height: 300px;
  overflow-y: auto;
  min-width: 150px;
}

.branch-picker button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  background: none;
  border: none;
  color: var(--color-text);
  cursor: pointer;
  border-radius: 4px;
}

.branch-picker button:hover {
  background: var(--color-bg-tertiary);
}

.branch-picker button.active {
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
```

### Success Criteria

**Manual:**
- [ ] Click "vs main" opens dropdown with all branches
- [ ] Selecting a branch fetches new diff
- [ ] Selected branch shown in hint
- [ ] Clicking outside closes dropdown
- [ ] Works with keyboard navigation

---

## Testing Strategy

**Manual Testing:**
1. Add repo with multiple branches
2. Click "vs main" → see all branches
3. Select different branch → diff updates
4. Refresh page → resets to default baseBranch
