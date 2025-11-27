# 03 - Git Operations (internal/git/)

## What This Package Does

Abstracts all Git operations - reading diffs, branches, commits, file contents.

Uses a mix of:
- **go-git** library (pure Go git implementation) for most operations
- **exec.Command("git", ...)** for some operations where go-git has limitations

---

## Visual: Diff Modes

Cerebro supports 3 different diff modes:

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DIFF MODES                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  MODE: "branch" (default)                                           │
│  ─────────────────────────                                          │
│  Compares your current branch against a base branch (e.g., main)   │
│                                                                     │
│      main ──●──●──●──●                                              │
│                     \                                                │
│      feature ────────●──●──●  ◄── HEAD                             │
│                      ▲                                              │
│                 merge-base                                          │
│                                                                     │
│  Shows: All commits since you branched off from main                │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  MODE: "working"                                                    │
│  ───────────────                                                    │
│  Shows all uncommitted changes (staged + unstaged + untracked)     │
│                                                                     │
│      ┌─────────────┐                                               │
│      │   HEAD      │ ◄── Last commit                               │
│      └──────┬──────┘                                               │
│             │ diff                                                  │
│             ▼                                                       │
│      ┌─────────────┐                                               │
│      │  Working    │ ◄── Your current files                        │
│      │  Directory  │                                               │
│      └─────────────┘                                               │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  MODE: "staged"                                                     │
│  ──────────────                                                     │
│  Shows only staged changes (what `git commit` would include)       │
│                                                                     │
│      ┌─────────────┐                                               │
│      │   HEAD      │                                               │
│      └──────┬──────┘                                               │
│             │ diff                                                  │
│             ▼                                                       │
│      ┌─────────────┐                                               │
│      │   Index     │ ◄── Staging area (git add)                    │
│      │  (staged)   │                                               │
│      └─────────────┘                                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Structures

### FileInfo - Represents one changed file

```go
type FileInfo struct {
    Path      string        // e.g., "src/app.go"
    Status    string        // "added", "modified", "deleted", "renamed", "untracked"
    Additions int           // Lines added (+)
    Deletions int           // Lines removed (-)
    Patch     string        // The unified diff text
    OldFile   *FileContents // Full file before changes (for precision diffs)
    NewFile   *FileContents // Full file after changes (for precision diffs)
}
```

### Repo - Wrapper around go-git

```go
type Repo struct {
    repo *git.Repository  // go-git repo object
    path string           // Filesystem path
}
```

---

## Key Methods

```
┌─────────────────────────────────────────────────────────────────┐
│                           Repo                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  READING STATE                                                  │
│  ─────────────                                                  │
│  Open(path)           → Open a git repository                   │
│  CurrentBranch()      → Get current branch name                 │
│  CurrentCommit()      → Get HEAD commit hash                    │
│  RepoPath()           → Get absolute path to repo root          │
│  GetRemoteURL()       → Get origin remote URL                   │
│  GetDefaultBranch()   → Auto-detect main/master/develop         │
│                                                                 │
│  GETTING DIFFS                                                  │
│  ─────────────                                                  │
│  GetDiff(mode, base)       → Get files (dispatch by mode)       │
│  GetDiffFiles(base)        → Branch mode diff                   │
│  GetWorkingTreeDiff()      → Working mode diff                  │
│  GetStagedDiff()           → Staged mode diff                   │
│  GetDiffWithContents(...)  → Diff + full file contents          │
│                                                                 │
│  CHECKING STATUS                                                │
│  ───────────────                                                │
│  HasUncommittedChanges()   → Any changes at all?                │
│  HasStagedChanges()        → Any staged changes?                │
│                                                                 │
│  FILE OPERATIONS                                                │
│  ───────────────                                                │
│  Stage(filePath)           → git add <file>                     │
│  Unstage(filePath)         → git reset HEAD <file>              │
│  Discard(filePath)         → git checkout -- <file>             │
│  Commit(message)           → git commit -m "..."                │
│                                                                 │
│  READING FILES                                                  │
│  ─────────────                                                  │
│  GetFileAtHEAD(path)       → File contents at HEAD              │
│  GetFileAtRef(ref, path)   → File at specific ref               │
│  GetFileFromIndex(path)    → File from staging area             │
│  GetWorkingFile(path)      → File from working directory        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## How Branch Diff Works (GetDiffFiles)

```
GetDiffFiles(baseBranch)
         │
         ▼
┌─────────────────────┐
│ Find base branch    │ ◄── Try origin/main first, then local main
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Get base commit     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Get HEAD commit     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Find merge-base     │ ◄── Common ancestor of both branches
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Get tree at         │
│ merge-base          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Get tree at HEAD    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Compute diff        │ ◄── baseTree.Diff(headTree)
│ between trees       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Parse into          │
│ []FileInfo          │
└─────────────────────┘
```

---

## Why Merge-Base Matters

```
Without merge-base:
─────────────────────
main:     A ── B ── C ── D
                         ↑
feature:                 E ── F ── G
                              
Diff D..G would include changes from B, C, D too!

With merge-base:
────────────────
main:     A ── B ── C ── D
               ↑
               └── merge-base
feature:       B' ── E ── F ── G
                              
Diff B..G only shows E, F, G changes (what you actually wrote)
```

---

## Auto-Detecting Default Branch

```go
func (r *Repo) GetDefaultBranch() string {
    // 1. Check origin/HEAD symbolic ref
    //    (GitHub/GitLab set this to the default branch)
    
    // 2. Fallback: check if common names exist
    //    "main" → "master" → "develop" → "development"
    
    // 3. Last resort: return "main"
}
```

---

## go-git vs exec.Command

| Operation | Method Used | Why |
|-----------|-------------|-----|
| Open repo | go-git | Works well |
| Get branches | go-git | Works well |
| Branch diff | go-git | Full tree diff support |
| Working tree diff | exec git | go-git has bugs with worktree |
| Staged diff | exec git | Easier than go-git index |
| Stage/Unstage | exec git | Simpler than go-git |

---

## Parsing Diff Output

The `parseDiffOutput()` function turns raw diff text into `FileInfo` structs:

```
Input:
  diff --git a/foo.go b/foo.go
  --- a/foo.go
  +++ b/foo.go
  @@ -1,3 +1,4 @@
   package main
  +import "fmt"
   func main() {
  +    fmt.Println("hi")
   }

Output:
  FileInfo{
    Path:      "foo.go",
    Status:    "modified",
    Additions: 2,
    Deletions: 0,
    Patch:     "diff --git a/foo.go b/foo.go..."
  }
```

---

## Questions to Think About

1. Why check `origin/main` before `main` when computing diffs?
2. What's the difference between "untracked" and "added" status?
3. Why does `GetDiffWithContents()` skip files over 200KB?

---

## Next

Learn about configuration management:

```bash
cat docs/learn/04-config.md
```
