# AGENTS.md — AI Agent Guidelines for Cerebro Development

## Overview

Cerebro is a Git diff review tool written in Go with a React-based web interface. It runs as a background daemon that automatically starts when you enter a git repository.

## Architecture

### Core Components

1. **CLI** (`main.go`, `internal/cli/`)
   - Command-line interface using `urfave/cli`
   - Commands: `start`, `daemon`, `config`, `mcp`, `comments`, `notes`
   - Shell integration for auto-starting daemons

2. **Daemon Management** (`internal/daemon/`)
   - Manages background server processes per repository
   - Port allocation and PID tracking
   - Uses XDG conventions for state storage

3. **Git Integration** (`internal/git/`)
   - Uses `go-git` library for repository operations
   - Handles diff generation, merge-base calculation
   - Tracks branches, commits, and remote URLs

4. **Web Server** (`internal/server/`)
   - HTTP API for diff viewing and interaction
   - Serves embedded HTML/React frontend
   - Endpoints: `/api/diff`, `/api/status`, `/api/comments`, `/api/notes`

5. **State Management** (`internal/state/`)
   - Persistent storage for viewed files, comments, notes
   - Per-repo, per-branch, per-commit tracking
   - XDG-compliant data directory

6. **MCP Integration** (`internal/mcp/`)
   - Model Context Protocol server for LLM integration
   - Allows AI agents to query and resolve comments
   - **5 MCP tools:** `list_comments`, `resolve_comment`, `add_note`, `list_notes`, `dismiss_note`
   - Standalone CLI at `~/commands/cerebro-mcp` (generated via mcporter)

7. **Frontend** (`static/index.html`, `internal/server/static/`)
   - Single-page React app (embedded via `//go:embed`)
   - Uses Primer CSS (GitHub's design system)
   - Babel for in-browser JSX transformation (dev mode)

## Development Workflow

### Building

```bash
go build -o cerebro .
```

### Testing

```bash
go test ./...
```

### Running Locally

```bash
# Start server for current repo
./cerebro start

# Or use daemon mode
./cerebro daemon start
./cerebro  # Opens browser
```

### MCP Changes Checklist

When modifying MCP tools, follow these steps:

1. **Update both files** (schemas must stay in sync):
   - `internal/mcp/mcp.go` - tool implementations and schema
   - `internal/mcp/server.go` - tool schema in `handleToolsList()`

2. **Rebuild cerebro binary:**
   ```bash
   cd /path/to/cerebro
   go build -o cerebro .
   cp cerebro ~/commands/cerebro
   ```

3. **Regenerate cerebro-mcp CLI:**
   ```bash
   npx mcporter generate-cli \
     --command "~/commands/cerebro mcp" \
     --name cerebro-mcp \
     --compile ~/commands/cerebro-mcp
   ```

4. **Test the changes:**
   ```bash
   # Verify CLI works
   cerebro-mcp --help
   cerebro-mcp list-comments
   
   # Or test via mcporter directly
   npx mcporter call --stdio "~/commands/cerebro mcp" 'list_comments()'
   ```

### Using cerebro-mcp Tools

**Via the generated CLI:**
```bash
cerebro-mcp list-comments --resolved false
cerebro-mcp resolve-comment --comment-id "123-0"
cerebro-mcp add-note --file-path "src/foo.ts" --text "Explanation" --author "claude" --branch "main" --commit "abc123"
```

**Via mcporter (more reliable for optional args):**
```bash
# List unresolved comments
npx mcporter call --stdio "~/commands/cerebro mcp" 'list_comments(resolved: false)'

# Resolve a comment (resolved_by defaults to "agent")
npx mcporter call --stdio "~/commands/cerebro mcp" 'resolve_comment(comment_id: "123-0")'

# Add a note
npx mcporter call --stdio "~/commands/cerebro mcp" 'add_note(file_path: "src/foo.ts", text: "Rationale here", author: "claude", branch: "main", commit: "abc123")'
```

**Note:** The generated CLI has a known issue with optional arguments - use `npx mcporter call --stdio` if you encounter "Missing required arguments" errors for fields that should be optional.

## Common Issues & Solutions

### Issue 1: Base Branch Detection

**Problem:** Repos using `master` instead of `main` fail with "reference not found" 500 errors.

**Root Cause:**
- Hardcoded default of `main` in `config.Load()`
- No auto-detection of repository's default branch
- Poor error handling in `/api/diff` endpoint

**Solution:**
1. Add `GetDefaultBranch()` to `internal/git/git.go`:
   - Check `origin/HEAD` symbolic ref
   - Fallback to common branch names (main, master, develop)
2. Update `startDaemon()` in `main.go` to auto-detect if not configured
3. Improve error messages in `internal/server/server.go`

### Issue 2: In-Browser Babel Warning

**Problem:** Console warning about using Babel transformer in production.

**Root Cause:**
- Frontend uses `@babel/standalone` for runtime JSX compilation
- Development convenience vs. production performance

**Solution:**
- Add build step to precompile React code (optional enhancement)
- Or document that warning is expected for simplicity

### Issue 3: Frontend Asset Loading

**Problem:** Missing favicon causes 404 errors.

**Solution:**
- Add favicon to embedded assets (optional)
- Or ignore as non-critical

## Code Patterns

### Adding a New API Endpoint

1. Define request/response structs in `internal/server/server.go`
2. Add handler method on `AppState`
3. Register route in `Start()` function
4. Update frontend to call the new endpoint

### Adding State Persistence

1. Define data structure in `internal/state/state.go`
2. Add methods to `Manager` for CRUD operations
3. Use `s.StateManager` in server handlers
4. State is automatically saved to `$XDG_DATA_HOME/cerebro/`

### Working with Git Operations

```go
gitRepo, err := git.Open(".")
if err != nil {
    return err
}

// Common operations
branch, _ := gitRepo.CurrentBranch()
commit, _ := gitRepo.CurrentCommit()
files, _ := gitRepo.GetDiffFiles(baseBranch)
```

## File Organization

```
cerebro/
├── main.go                    # CLI entry point
├── internal/
│   ├── cli/                   # Command implementations
│   ├── config/                # Configuration management
│   ├── daemon/                # Daemon lifecycle
│   ├── git/                   # Git operations
│   ├── mcp/                   # MCP protocol server
│   ├── server/                # HTTP server + API
│   │   └── static/            # Embedded frontend
│   └── state/                 # Persistent state
├── static/                    # Frontend development
│   └── index.html            # React SPA
├── docs/                      # Documentation
└── README.md
```

## Key Dependencies

- `github.com/go-git/go-git/v5` - Pure Go git implementation
- `github.com/urfave/cli/v2` - CLI framework
- `github.com/gorilla/mux` - HTTP router
- `github.com/BurntSushi/toml` - Config file parsing
- React 18 + Primer CSS - Frontend (CDN-loaded)

## Testing Strategy

1. **Unit tests** for pure logic (helpers, formatters)
2. **Integration tests** for git operations
3. **Manual testing** for UI/UX flows
4. **MCP integration tests** for AI agent interactions

## AI Agent Best Practices

When modifying this codebase:

1. **Preserve embedded assets** - Don't break `//go:embed` directives
2. **Maintain XDG compliance** - Use provided path helpers
3. **Handle git edge cases** - Not all repos have main/master/origin
4. **Thread-safe state access** - Use `s.mu` locks in server handlers
5. **Graceful degradation** - Missing features shouldn't crash the server
6. **Clear error messages** - Help users diagnose issues
7. **MCP schema consistency** - When modifying MCP tools:
   - Update both `internal/mcp/mcp.go` (implementation) AND `internal/mcp/server.go` (schema)
   - Schemas in `handleToolsList()` must match function signatures
   - After changes, regenerate `cerebro-mcp` CLI (see "Regenerating cerebro-mcp CLI" above)

## Tool Selection for Development

- **Find files:** `fd` (fast file finding)
- **Search code:** `rg` (ripgrep)
- **AST queries:** `ast-grep --lang go -p '<pattern>'`
- **Build/test:** `go build`, `go test`
- **Linting:** `golangci-lint run` (if available)

## Performance Considerations

- Diffs are computed on-demand (not cached)
- State files are loaded/saved synchronously
- Frontend syntax highlighting happens client-side
- No connection pooling (single-user tool)

## Security Notes

- Only listens on `127.0.0.1` (localhost)
- No authentication (not needed for local-only tool)
- Daemon PIDs stored in user's home directory
- No remote data transmission

## Future Enhancements (Ideas)

- [ ] Precompiled React bundle for production
- [ ] Diff caching for performance
- [ ] Support for comparing arbitrary branches
- [ ] GitHub-style code review workflows
- [ ] VS Code extension integration
- [ ] AI-powered commit message suggestions
- [ ] Collaborative review features (with auth)

---

**For more details, see:**
- [docs/README.md](docs/README.md) - User documentation
- [README.md](README.md) - Quick start guide
- [CHANGELOG.md](CHANGELOG.md) - Version history
