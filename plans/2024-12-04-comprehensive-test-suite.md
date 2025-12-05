# Comprehensive Test Suite Implementation Plan

## Overview

Add thorough test coverage to Cerebro's backend before introducing Zod validation. Tests will document current behavior and catch regressions when we add stricter typing.

## Current State

### Code Coverage

| Module | Lines | Test File | Tests | Coverage |
|--------|-------|-----------|-------|----------|
| `src/state/index.ts` | 429 | `comments.test.ts` | 1 | ~5% |
| `src/server/index.ts` | 538 | none | 0 | 0% |
| `src/git/index.ts` | 541 | none | 0 | 0% |
| `src/cli/index.ts` | 276 | `index.test.ts` | 5 | ~20% |
| `src/state/db.ts` | 150 | none | 0 | 0% |

### Existing Test Patterns

From `src/cli/index.test.ts`:
- Uses temp directory with `CEREBRO_CONFIG_DIR` env var
- Lazy imports modules after setting up temp HOME
- Proper cleanup in `afterAll`

```typescript
beforeAll(async () => {
  tempHome = mkdtempSync(join(tmpdir(), "cerebro-test-"));
  process.env["CEREBRO_CONFIG_DIR"] = configDir;
  state = await import("../state");
});
```

## Desired End State

| Module | Target Tests | Target Coverage |
|--------|--------------|-----------------|
| `src/state/index.ts` | 25+ | 90%+ |
| `src/server/index.ts` | 30+ | 85%+ |
| `src/git/index.ts` | 15+ | 70% (mocked) |
| `src/cli/index.ts` | 10+ | 80% |

**Total: 80+ tests** (currently 6)

## Out of Scope

- Frontend tests (React components)
- E2E tests with real browser
- Performance/load testing
- MCP server tests (module doesn't exist yet)

---

## Phase 1: State Module Tests

### Overview
Complete test coverage for `src/state/index.ts` - the core data layer.

### File: `src/state/index.test.ts`

```typescript
// Test structure
describe("state", () => {
  describe("config", () => { ... });
  describe("repos", () => { ... });
  describe("viewed files", () => { ... });
  describe("comments", () => { ... });
  describe("notes", () => { ... });
});
```

### Tests to Write

#### Config Tests
| Test | Description |
|------|-------------|
| `getConfig returns defaults when file missing` | Fresh install returns `{ defaultPort: 3030 }` |
| `getConfig returns saved values` | After saveConfig, values persist |
| `saveConfig creates config directory` | Works even if ~/.config/cerebro doesn't exist |
| `getConfig handles corrupted JSON` | Returns defaults if file is malformed |

#### Repository Tests
| Test | Description |
|------|-------------|
| `addRepo creates new repository` | Returns repo with generated ID |
| `addRepo returns existing repo if path matches` | Idempotent - same path returns same repo |
| `addRepo sets first repo as current` | Auto-selects when no repos exist |
| `addRepo does not change current for subsequent repos` | Only first repo auto-selected |
| `getRepo returns undefined for unknown ID` | Handles missing repos gracefully |
| `getRepoByPath returns repo by absolute path` | Path-based lookup works |
| `getRepoByPath returns undefined for unknown path` | Handles missing paths |
| `getRepos returns all repos sorted by addedAt DESC` | Most recent first |
| `getRepos returns empty array when no repos` | Clean empty state |
| `removeRepo deletes repo and cascades` | Comments, notes, viewed files deleted |
| `removeRepo updates current repo to next available` | Falls back to another repo |
| `removeRepo clears current repo when last removed` | No current repo after last delete |
| `removeRepo returns false for unknown ID` | Handles missing repos |
| `setCurrentRepo updates current` | Can switch between repos |
| `setCurrentRepo with null clears current` | Can unset current repo |
| `setCurrentRepo returns false for unknown ID` | Validates repo exists |
| `getCurrentRepo returns current repo` | Basic getter works |
| `getCurrentRepo falls back to first repo` | When no explicit current set |
| `getCurrentRepo returns undefined when no repos` | Empty state handling |
| `updateRepo updates baseBranch` | Partial update works |
| `updateRepo updates name` | Partial update works |
| `updateRepo returns false for unknown ID` | Validates repo exists |

#### Viewed Files Tests
| Test | Description |
|------|-------------|
| `getViewedFiles returns empty object initially` | Fresh repo has no viewed files |
| `setFileViewed marks file as viewed` | Basic mark works |
| `setFileViewed with false removes viewed status` | Can unmark files |
| `getViewedFiles returns all viewed for branch/commit` | Scoped to branch and commit |
| `viewed files are scoped to repo` | Different repos have separate state |
| `viewed files are scoped to branch` | Same file different branch = separate |
| `viewed files are scoped to commit` | Same file different commit = separate |
| `viewed files cascade delete with repo` | Cleaned up when repo removed |

#### Comments Tests (expand existing)
| Test | Description |
|------|-------------|
| `addComment creates comment with generated ID` | Basic create works |
| `addComment sets timestamp automatically` | Timestamp is set |
| `addComment without line_number works` | File-level comments |
| `getComments returns all for repo` | Without branch filter |
| `getComments filters by branch` | Only unresolved on branch |
| `getComments includes resolved when no branch filter` | All comments returned |
| `resolveComment marks as resolved` | Sets resolved flag |
| `resolveComment sets resolved_by and resolved_at` | Metadata captured |
| `resolveComment returns false for unknown ID` | Handles missing |
| `resolveComment returns false for wrong repo` | Scoped to repo |
| `comments cascade delete with repo` | Cleaned up when repo removed |

#### Notes Tests
| Test | Description |
|------|-------------|
| `addNote creates note with generated ID` | Basic create works |
| `addNote stores all fields correctly` | author, type, metadata preserved |
| `addNote with metadata serializes JSON` | Complex metadata works |
| `getNotes returns all for repo` | Without branch filter |
| `getNotes filters by branch` | Only undismissed on branch |
| `getNotes includes dismissed when no branch filter` | All notes returned |
| `dismissNote marks as dismissed` | Sets dismissed flag |
| `dismissNote sets dismissed_by and dismissed_at` | Metadata captured |
| `dismissNote returns false for unknown ID` | Handles missing |
| `note types are validated` | explanation, rationale, suggestion |
| `notes cascade delete with repo` | Cleaned up when repo removed |

### Success Criteria

**Automated:**
- [ ] `bun test src/state/` passes
- [ ] All 40+ state tests pass
- [ ] No console errors during tests

**Manual:**
- [ ] Review test output for clear descriptions

---

## Phase 2: Server API Tests

### Overview
Integration tests for all API endpoints. Uses actual server with test database.

### File: `src/server/index.test.ts`

```typescript
describe("API", () => {
  let baseUrl: string;
  let testRepoPath: string;
  
  beforeAll(async () => {
    // Setup temp config dir
    // Create temp git repo for testing
    // Start server on random port
  });
  
  afterAll(async () => {
    // Stop server
    // Cleanup temp directories
  });
  
  describe("GET /api/health", () => { ... });
  describe("repos API", () => { ... });
  describe("diff API", () => { ... });
  describe("comments API", () => { ... });
  describe("notes API", () => { ... });
  describe("git operations API", () => { ... });
});
```

### Tests to Write

#### Health & Static
| Test | Description |
|------|-------------|
| `GET /api/health returns 200 with status ok` | Health check works |
| `GET / returns index.html` | Static serving works |
| `GET /unknown returns index.html (SPA fallback)` | Client routing support |
| `OPTIONS requests return CORS headers` | Preflight works |

#### Repos API
| Test | Description |
|------|-------------|
| `GET /api/repos returns empty initially` | Clean state |
| `POST /api/repos adds valid repo` | Create works |
| `POST /api/repos rejects non-git directory` | Validates git repo |
| `POST /api/repos rejects missing path` | Validates input |
| `POST /api/repos returns existing for duplicate path` | Idempotent |
| `GET /api/repos returns added repos` | List works |
| `DELETE /api/repos/:id removes repo` | Delete works |
| `DELETE /api/repos/:id returns 404 for unknown` | Handles missing |
| `POST /api/repos/current sets current repo` | Switch repos |
| `POST /api/repos/current returns 404 for unknown` | Validates ID |
| `GET /api/repos filters out invalid paths` | Auto-cleanup |

#### Diff API
| Test | Description |
|------|-------------|
| `GET /api/diff returns 400 without repo` | Requires repo |
| `GET /api/diff?mode=branch returns branch diff` | Branch mode |
| `GET /api/diff?mode=working returns working diff` | Working mode |
| `GET /api/diff?mode=staged returns staged diff` | Staged mode |
| `GET /api/diff includes viewed state` | Marks viewed files |
| `GET /api/file-diff returns single file` | Lazy loading |
| `GET /api/file-diff returns 404 for unknown file` | Handles missing |

#### Viewed Files API
| Test | Description |
|------|-------------|
| `POST /api/mark-viewed marks file` | Mark works |
| `POST /api/mark-viewed returns 400 without repo` | Requires repo |
| `POST /api/unmark-viewed unmarks file` | Unmark works |

#### Comments API
| Test | Description |
|------|-------------|
| `GET /api/comments returns comments for repo` | List works |
| `GET /api/comments returns 400 without repo` | Requires repo |
| `POST /api/comments creates comment` | Create works |
| `POST /api/comments with line_number` | Line comments |
| `POST /api/comments/resolve resolves comment` | Resolve works |
| `POST /api/comments/resolve returns 404 for unknown` | Handles missing |

#### Notes API
| Test | Description |
|------|-------------|
| `GET /api/notes returns notes for repo` | List works |
| `POST /api/notes/dismiss dismisses note` | Dismiss works |
| `POST /api/notes/dismiss returns 404 for unknown` | Handles missing |

#### Git Operations API
| Test | Description |
|------|-------------|
| `POST /api/stage stages file` | Stage works |
| `POST /api/unstage unstages file` | Unstage works |
| `POST /api/discard discards changes` | Discard works |
| `POST /api/commit creates commit` | Commit works |
| `POST /api/commit returns 400 without message` | Validates input |

### Helper: Create Test Git Repo

```typescript
async function createTestRepo(dir: string): Promise<string> {
  const repoPath = join(dir, "test-repo");
  await Bun.$`mkdir -p ${repoPath}`;
  await Bun.$`git -C ${repoPath} init`;
  await Bun.$`git -C ${repoPath} config user.email "test@test.com"`;
  await Bun.$`git -C ${repoPath} config user.name "Test"`;
  
  // Create initial commit
  await Bun.write(join(repoPath, "README.md"), "# Test");
  await Bun.$`git -C ${repoPath} add .`;
  await Bun.$`git -C ${repoPath} commit -m "Initial commit"`;
  
  return repoPath;
}
```

### Success Criteria

**Automated:**
- [ ] `bun test src/server/` passes
- [ ] All 35+ API tests pass
- [ ] Server starts and stops cleanly

**Manual:**
- [ ] Test with actual browser after tests pass

---

## Phase 3: Git Module Tests (Mocked)

### Overview
Test git operations using mocked `simple-git`. Focus on logic, not actual git calls.

### File: `src/git/index.test.ts`

```typescript
import { mock } from "bun:test";

// Mock simple-git before importing
mock.module("simple-git", () => ({
  default: () => mockGit,
}));

const mockGit = {
  branch: mock(() => Promise.resolve({ current: "feature", all: ["main", "feature"] })),
  revparse: mock(() => Promise.resolve("abc1234")),
  status: mock(() => Promise.resolve({ modified: [], not_added: [], deleted: [], staged: [] })),
  diff: mock(() => Promise.resolve("")),
  // ... etc
};
```

### Tests to Write

#### Branch/Commit Info
| Test | Description |
|------|-------------|
| `getCurrentBranch returns current branch` | Parses git branch output |
| `getCurrentCommit returns short hash` | Truncates to 7 chars |
| `getDefaultBranch detects from remote` | Parses remote show |
| `getDefaultBranch falls back to common names` | main > master > develop |
| `getDefaultBranch falls back to current` | Last resort |
| `getRemoteUrl returns origin URL` | Parses remotes |
| `getRemoteUrl returns undefined without remote` | Handles no remote |

#### Diff Operations
| Test | Description |
|------|-------------|
| `getDiff branch mode uses merge-base` | Correct git commands |
| `getDiff working mode shows unstaged` | Filters staged files |
| `getDiff staged mode shows staged only` | Uses --cached |
| `getFileDiff returns single file diff` | Lazy loading |
| `countChanges counts additions and deletions` | Parse +/- lines |

#### File Operations
| Test | Description |
|------|-------------|
| `stageFile calls git add` | Correct command |
| `unstageFile calls git reset` | Correct command |
| `discardFile restores tracked file` | git checkout |
| `discardFile removes untracked file` | rm command |
| `commit calls git commit` | Returns hash |

#### Utilities
| Test | Description |
|------|-------------|
| `isGitRepo returns true for git directory` | Detects .git |
| `isGitRepo returns false for non-git` | Rejects plain dirs |
| `getRepoName extracts basename` | /path/to/repo → repo |
| `getGitManager caches by path` | Same instance returned |

### Success Criteria

**Automated:**
- [ ] `bun test src/git/` passes
- [ ] All 20+ git tests pass
- [ ] No actual git operations performed

---

## Phase 4: Integration & Edge Cases

### Overview
Additional tests for edge cases and cross-module integration.

### File: `src/integration.test.ts`

### Tests to Write

| Test | Description |
|------|-------------|
| `full workflow: add repo → mark viewed → add comment` | Happy path |
| `concurrent requests don't corrupt state` | SQLite WAL mode |
| `large diff doesn't crash` | Memory handling |
| `unicode in file paths works` | Encoding |
| `unicode in comments works` | Encoding |
| `special characters in repo path` | Spaces, quotes |
| `repo removal cleans all related data` | Cascade verification |
| `server handles malformed JSON gracefully` | Error responses |
| `server handles missing request body` | Error responses |

### Success Criteria

**Automated:**
- [ ] `bun test` (all tests) passes
- [ ] No flaky tests

---

## Testing Strategy Summary

### Test Utilities to Create

**File: `src/test-utils.ts`**

```typescript
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export function createTestEnvironment() {
  const tempHome = mkdtempSync(join(tmpdir(), "cerebro-test-"));
  const configDir = join(tempHome, ".config", "cerebro");
  
  process.env["CEREBRO_CONFIG_DIR"] = configDir;
  process.env["HOME"] = tempHome;
  mkdirSync(configDir, { recursive: true });
  
  return {
    tempHome,
    configDir,
    cleanup: () => rmSync(tempHome, { recursive: true, force: true }),
  };
}

export async function createTestGitRepo(baseDir: string, name = "test-repo") {
  const repoPath = join(baseDir, name);
  await Bun.$`mkdir -p ${repoPath}`;
  await Bun.$`git -C ${repoPath} init`;
  await Bun.$`git -C ${repoPath} config user.email "test@test.com"`;
  await Bun.$`git -C ${repoPath} config user.name "Test"`;
  await Bun.write(join(repoPath, "README.md"), "# Test Repo");
  await Bun.$`git -C ${repoPath} add .`;
  await Bun.$`git -C ${repoPath} commit -m "Initial commit"`;
  return repoPath;
}
```

### Run Order

```bash
# Run all tests
bun test

# Run specific module
bun test src/state/
bun test src/server/
bun test src/git/

# Run with coverage (future)
bun test --coverage
```

### File Structure After Implementation

```
src/
├── cli/
│   ├── index.ts
│   └── index.test.ts          # Existing + expanded
├── git/
│   ├── index.ts
│   └── index.test.ts          # NEW
├── server/
│   ├── index.ts
│   └── index.test.ts          # NEW
├── state/
│   ├── db.ts
│   ├── index.ts
│   ├── index.test.ts          # NEW (replaces comments.test.ts)
│   └── comments.test.ts       # DELETE (merged into index.test.ts)
├── types/
│   └── index.ts
├── test-utils.ts              # NEW
├── integration.test.ts        # NEW
└── index.ts
```

---

## Implementation Order

1. **Create `src/test-utils.ts`** - Shared test helpers
2. **Phase 1: `src/state/index.test.ts`** - Most critical, foundation
3. **Phase 2: `src/server/index.test.ts`** - API contract tests
4. **Phase 3: `src/git/index.test.ts`** - Mocked git operations
5. **Phase 4: `src/integration.test.ts`** - Edge cases

## Time Estimates

| Phase | Estimated Time |
|-------|---------------|
| Test utils | 15 min |
| Phase 1 (State) | 1-2 hours |
| Phase 2 (Server) | 2-3 hours |
| Phase 3 (Git) | 1-2 hours |
| Phase 4 (Integration) | 1 hour |
| **Total** | **5-8 hours** |

---

## References

- Existing tests: `src/cli/index.test.ts`, `src/state/comments.test.ts`
- Bun test docs: https://bun.sh/docs/cli/test
- State module: `src/state/index.ts:1-429`
- Server module: `src/server/index.ts:1-538`
- Git module: `src/git/index.ts:1-541`
