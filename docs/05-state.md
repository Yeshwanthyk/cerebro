# 05 - State Management (internal/state/)

## What This Package Does

Persists **user data** across sessions:
- Which files have been viewed (reviewed)
- Code review comments
- AI agent notes

All stored in a single JSON file.

---

## Visual: State Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                      STATE STRUCTURE                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   ViewedState                                                       │
│       │                                                             │
│       └── Repos (map)                                              │
│            │                                                        │
│            └── "/Users/you/projects/myapp" (repo path)             │
│                 │                                                   │
│                 └── Branches (map)                                 │
│                      │                                              │
│                      └── "feature-login" (branch name)             │
│                           │                                         │
│                           └── Commits (map)                        │
│                                │                                    │
│                                └── "abc123..." (commit hash)       │
│                                     │                               │
│                                     └── RepoState                  │
│                                          ├── ViewedFiles []        │
│                                          ├── Comments []           │
│                                          └── Notes []              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Why This Structure?

The nested structure tracks state **per commit**:

```
You're on branch "feature-login" at commit "abc123"
  → You review files A, B, C
  → You mark them as "viewed"

Later, you push new commits "def456", "ghi789"
  → Files might have changed!
  → You need to re-review them

The nested structure keeps these separate:
  feature-login/abc123 → {ViewedFiles: [A, B, C]}
  feature-login/def456 → {ViewedFiles: []}  ← fresh start!
```

---

## Data Structures

### Comment - Human code review comment

```go
type Comment struct {
    ID         string  // "1732500000-0" (timestamp-index)
    FilePath   string  // "src/app.go"
    LineNumber *int    // Line number (optional, nil = file-level)
    Text       string  // The comment content
    Timestamp  int64   // Unix timestamp
    Branch     string  // Which branch
    Commit     string  // Which commit
    Resolved   bool    // Has it been addressed?
    ResolvedBy string  // Who resolved it
    ResolvedAt int64   // When resolved
}
```

### Note - AI agent annotation

```go
type Note struct {
    ID          string            // Unique ID
    FilePath    string            // Which file
    LineNumber  int               // Which line
    Text        string            // The note content (markdown)
    Timestamp   int64             // When created
    Branch      string            // Which branch
    Commit      string            // Which commit
    Author      string            // "claude", "copilot", "gpt-4"
    Type        string            // "explanation", "rationale", "suggestion"
    Metadata    map[string]string // Extra data (model version, etc.)
    Dismissed   bool              // User dismissed the note?
    DismissedBy string            // Who dismissed
    DismissedAt int64             // When dismissed
}
```

---

## File Storage

```
~/.local/state/cerebro/viewed.json
```

Example content:

```json
{
  "repos": {
    "/Users/you/projects/myapp": {
      "feature-login": {
        "abc123def456": {
          "viewed_files": ["src/app.go", "src/handler.go"],
          "comments": [
            {
              "id": "1732500000-0",
              "file_path": "src/app.go",
              "line_number": 42,
              "text": "Should we add error handling here?",
              "timestamp": 1732500000,
              "branch": "feature-login",
              "commit": "abc123def456",
              "resolved": false
            }
          ],
          "notes": [
            {
              "id": "1732500100-0",
              "file_path": "src/app.go",
              "line_number": 42,
              "text": "This function could benefit from better error handling.",
              "author": "claude",
              "type": "suggestion"
            }
          ]
        }
      }
    }
  }
}
```

---

## Manager Methods

```
┌─────────────────────────────────────────────────────────────────┐
│                         Manager                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CONSTRUCTOR                                                    │
│  ───────────                                                    │
│  NewManager() → *Manager                                        │
│      Creates manager, loads existing state from disk            │
│                                                                 │
│  VIEWED FILES                                                   │
│  ────────────                                                   │
│  IsFileViewed(repo, branch, commit, file) → bool               │
│  MarkFileViewed(repo, branch, commit, file) → error            │
│  UnmarkFileViewed(repo, branch, commit, file) → error          │
│                                                                 │
│  COMMENTS                                                       │
│  ────────                                                       │
│  AddComment(repo, branch, commit, file, line, text) → Comment  │
│  GetComments(repo, branch, commit, file) → []Comment           │
│  GetAllComments(repo) → []Comment                              │
│  ResolveComment(repo, branch, commit, id, by) → error          │
│                                                                 │
│  NOTES                                                          │
│  ─────                                                          │
│  AddNote(repo, branch, commit, file, line, text,               │
│          author, type, metadata) → Note                         │
│  GetNotes(repo, branch, commit, file) → []Note                 │
│  GetAllNotes(repo) → []Note                                    │
│  GetNotesForBranch(repo, branch, file) → []Note                │
│  DismissNote(repo, branch, commit, id, by) → error             │
│                                                                 │
│  INTERNAL                                                       │
│  ────────                                                       │
│  save() → error           Write state to disk                   │
│  Reload() → error         Re-read state from disk               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Lazy Initialization Pattern

The Manager uses **lazy initialization** for nested maps:

```go
func (m *Manager) MarkFileViewed(repoPath, branch, commit, filePath string) error {
    // Create repo map if doesn't exist
    if m.state.Repos[repoPath] == nil {
        m.state.Repos[repoPath] = make(map[string]map[string]*RepoState)
    }

    // Create branch map if doesn't exist
    if m.state.Repos[repoPath][branch] == nil {
        m.state.Repos[repoPath][branch] = make(map[string]*RepoState)
    }

    // Create commit state if doesn't exist
    if m.state.Repos[repoPath][branch][commit] == nil {
        m.state.Repos[repoPath][branch][commit] = &RepoState{
            ViewedFiles: []string{},
            Comments:    []*Comment{},
            Notes:       []*Note{},
        }
    }

    // Now safe to add the file
    ...
}
```

This pattern appears in `MarkFileViewed`, `AddComment`, and `AddNote`.

---

## ID Generation

IDs are simple but unique:

```go
id := fmt.Sprintf("%d-%d", timestamp, len(existingItems))
// Example: "1732500000-0", "1732500000-1", etc.
```

---

## Comments vs Notes

| Feature | Comment | Note |
|---------|---------|------|
| Created by | Human users | AI agents |
| Purpose | Code review feedback | Explanations, suggestions |
| Resolution | Can be "resolved" | Can be "dismissed" |
| Line optional | Yes (`LineNumber *int`) | No (`LineNumber int`) |
| Has metadata | No | Yes (model, context, etc.) |

---

## Flow: Adding an AI Note

```
AI Agent → MCP Server → State Manager → JSON File
    │           │              │             │
    │           │              │             │
    └─ add_note │              │             │
        tool    │              │             │
                └─ AddNote()   │             │
                               └─ save()     │
                                             └─ viewed.json
```

---

## Questions to Think About

1. Why track state per-commit instead of just per-branch?
2. What's the difference between `GetNotes()` and `GetNotesForBranch()`?
3. Why does `Reload()` exist? (Hint: think about multiple processes)

---

## Next

Learn about the HTTP server and API:

```bash
cat docs/learn/06-server.md
```
