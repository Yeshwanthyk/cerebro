# 06 - HTTP Server (internal/server/)

## What This Package Does

Runs an HTTP server that:
1. Serves the React frontend
2. Provides REST API for the frontend to fetch data
3. Handles git operations (stage, commit, etc.)

---

## Visual: Server Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       HTTP SERVER                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   Browser Request                                                   │
│        │                                                            │
│        ▼                                                            │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    gorilla/mux Router                       │   │
│   └────────────────────────────┬────────────────────────────────┘   │
│                                │                                    │
│        ┌───────────────────────┼───────────────────────┐            │
│        │                       │                       │            │
│        ▼                       ▼                       ▼            │
│   ┌─────────┐           ┌───────────┐          ┌───────────┐        │
│   │  GET /  │           │ /api/diff │          │ /api/...  │        │
│   │ (HTML)  │           │  (JSON)   │          │  (JSON)   │        │
│   └────┬────┘           └─────┬─────┘          └─────┬─────┘        │
│        │                      │                      │              │
│        ▼                      ▼                      ▼              │
│   ┌─────────┐           ┌───────────┐          ┌───────────┐        │
│   │ Vite    │           │   Git     │          │  State    │        │
│   │ Build   │           │  Package  │          │  Manager  │        │
│   │ (embed) │           └───────────┘          └───────────┘        │
│   └─────────┘                                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Embedded Files (//go:embed)

The frontend is **embedded** into the Go binary:

```go
//go:embed static/index.html
var legacyIndexHTML string

//go:embed static/dist
var distFS embed.FS
```

This means:
- When you build `go build`, the HTML/JS/CSS are compiled INTO the binary
- No need to ship separate files
- The `cerebro` binary is fully self-contained

---

## API Endpoints

```
┌───────────────────────────────────────────────────────────────────┐
│                        REST API                                    │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  GET  /                    → Serve React app (index.html)         │
│  GET  /assets/*            → Serve JS/CSS (Vite build)            │
│                                                                   │
│  DIFF & STATUS                                                    │
│  ─────────────                                                    │
│  GET  /api/diff            → Get all changed files + patches      │
│  GET  /api/status          → Get repo path, branch, commit        │
│                                                                   │
│  VIEWED FILES                                                     │
│  ────────────                                                     │
│  POST /api/mark-viewed     → Mark a file as reviewed              │
│  POST /api/unmark-viewed   → Unmark a file                        │
│                                                                   │
│  COMMENTS                                                         │
│  ────────                                                         │
│  GET  /api/comments        → List comments (?file_path=...)       │
│  POST /api/comments        → Add a comment                        │
│  POST /api/comments/resolve → Resolve a comment                   │
│                                                                   │
│  NOTES                                                            │
│  ─────                                                            │
│  GET  /api/notes           → List AI notes (?file_path=...)       │
│  POST /api/notes           → Add a note                           │
│  POST /api/notes/dismiss   → Dismiss a note                       │
│                                                                   │
│  GIT OPERATIONS                                                   │
│  ──────────────                                                   │
│  POST /api/stage           → git add <file>                       │
│  POST /api/unstage         → git reset HEAD <file>                │
│  POST /api/discard         → git checkout -- <file>               │
│  POST /api/commit          → git commit -m "message"              │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## AppState - Server's Context

```go
type AppState struct {
    RepoPath     string         // Absolute path to git repo
    BaseBranch   string         // Branch to compare against
    Mode         git.DiffMode   // "branch", "working", or "staged"
    StateManager *state.Manager // For comments, notes, viewed
    mu           sync.Mutex     // Thread safety!
}
```

The `mu sync.Mutex` is important! Multiple HTTP requests can come in simultaneously, and they all access the same `StateManager`.

---

## Request/Response Types

### DiffResponse (GET /api/diff)

```go
type DiffResponse struct {
    Files      []FileDiff  // All changed files
    Branch     string      // Current branch name
    Commit     string      // Current commit hash
    RepoPath   string      // Absolute repo path
    RemoteURL  string      // Origin URL (for GitHub links)
    Mode       string      // "branch", "working", "staged"
    BaseBranch string      // What we're comparing against
}

type FileDiff struct {
    Path      string            // File path
    Status    string            // added/modified/deleted/renamed
    Additions int               // Lines added
    Deletions int               // Lines removed
    Patch     string            // Unified diff text
    Viewed    bool              // Has user reviewed this?
    OldFile   *git.FileContents // Full file before (precision diff)
    NewFile   *git.FileContents // Full file after (precision diff)
}
```

---

## Flow: GET /api/diff

```
Request: GET /api/diff
           │
           ▼
    ┌──────────────┐
    │ Lock mutex   │ ◄── Thread safety
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Open git     │
    │ repository   │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Get current  │
    │ branch/commit│
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Get diff     │ ◄── Based on mode (branch/working/staged)
    │ files        │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Check viewed │ ◄── For each file, check state
    │ status       │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ JSON encode  │
    │ response     │
    └──────────────┘
```

---

## Synthetic Commit IDs

For working/staged modes, there's no "real" commit to track state against:

```go
stateCommit := currentCommit
if mode == git.DiffModeWorking {
    stateCommit = "working"    // ← Synthetic ID
} else if mode == git.DiffModeStaged {
    stateCommit = "staged"     // ← Synthetic ID
}
```

This lets the state manager work consistently across all modes.

---

## State Reload

The server calls `StateManager.Reload()` before reading comments/notes:

```go
func (s *AppState) getNotesHandler(w http.ResponseWriter, r *http.Request) {
    // Reload state to pick up external changes (e.g., from MCP)
    if err := s.StateManager.Reload(); err != nil {
        http.Error(w, ...)
        return
    }
    ...
}
```

Why? Because the MCP server (a separate process) might have added notes!

---

## Error Handling for Missing Branch

```go
if strings.Contains(errMsg, "reference not found") {
    detectedBranch := gitRepo.GetDefaultBranch()
    http.Error(w, fmt.Sprintf(
        "Base branch '%s' not found. This repository's default branch appears to be '%s'. "+
        "Please configure cerebro with: cerebro config set base-branch %s",
        s.BaseBranch, detectedBranch, detectedBranch,
    ), http.StatusNotFound)
    return
}
```

Instead of a cryptic error, users get actionable instructions!

---

## Thread Safety Pattern

Every handler that modifies state follows this pattern:

```go
func (s *AppState) someHandler(w http.ResponseWriter, r *http.Request) {
    s.mu.Lock()         // ← Acquire lock
    defer s.mu.Unlock() // ← Release when function returns

    // ... do work safely ...
}
```

---

## Questions to Think About

1. Why embed the frontend instead of serving from disk?
2. Why does `getNotesHandler` reload state but `diffHandler` doesn't?
3. What would happen if we removed the mutex?

---

## Next

Learn about the MCP (Model Context Protocol) for AI integration:

```bash
cat docs/learn/07-mcp.md
```
