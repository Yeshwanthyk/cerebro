# AGENTS.md — AI Agent Guidelines for Cerebro Development

## Overview

Cerebro is a Git diff review tool built with Bun and React, with a native macOS wrapper. It provides a web-based interface for reviewing code changes with GitHub-style UI.

## Architecture

### Core Components

1. **Bun Server** (`src/server/`)
   - HTTP server using `Bun.serve()`
   - REST API for diff viewing, comments, notes
   - Static file serving (embedded in production binary)

2. **CLI** (`src/cli/`)
   - Command-line interface using `commander`
   - Commands: `start`, `repo`, `config`, `comments`, `notes`

3. **Git Integration** (`src/git/`)
   - Uses `simple-git` for repository operations
   - Handles diff generation, staging, commits
   - Supports branch comparison and working directory changes

4. **State Management** (`src/state/`)
   - JSON-based persistence in `~/.config/cerebro/`
   - Multi-repo tracking
   - Per-repo comments and notes

5. **React Frontend** (`web/`)
   - React 18 with TypeScript
   - Uses `@pierre/precision-diffs` for diff rendering
   - Vite for development, embedded in production binary

6. **macOS App** (`mac/`)
   - AppKit menu bar application (not SwiftUI)
   - Manages Bun server process via `ServerManager`
   - WKWebView for UI display
   - CLI installer

7. **CLI for AI Agents** (see CLI Reference below)
   - Full programmatic access via CLI commands
   - Comments: `cerebro comments list|add|resolve`
   - Notes: `cerebro notes list|add|dismiss`
   - No MCP needed - CLI provides full access

## File Organization

```
cerebro/
├── src/                      # Bun application source
│   ├── index.ts              # Main entry point
│   ├── cli/                  # CLI commands
│   ├── git/                  # Git operations
│   ├── server/               # HTTP server & routes
│   ├── state/                # State persistence
│   └── types/                # Shared types
├── web/                      # React frontend
│   ├── src/
│   │   ├── api/              # API client
│   │   ├── components/       # React components
│   │   ├── hooks/            # Custom hooks
│   │   ├── fonts/            # Web fonts
│   │   └── images/           # Static images
│   ├── build.ts              # Vite build script
│   └── index.html            # Entry HTML
├── mac/                      # macOS app
│   ├── Sources/
│   │   ├── CerebroApp.swift  # App entry & delegate
│   │   └── CerebroKit/
│   │       ├── ServerManager.swift
│   │       ├── WebViewController.swift
│   │       ├── MenuManager.swift
│   │       └── CLIInstaller.swift
│   ├── Makefile              # Build commands
│   └── Package.swift
├── scripts/
│   └── build-executable.ts   # Single binary builder
├── package.json
├── tsconfig.json
└── bunfig.toml
```

## Development Workflow

### Prerequisites

- Bun 1.3.2+
- Xcode 15+ (for macOS app)

### Building

```bash
# Install dependencies
bun install
cd web && bun install

# Development mode (hot reload)
bun run dev

# Build production binary
bun run build

# Build macOS app
cd mac && make release
```

### Testing

```bash
bun test
```

### Running Locally

```bash
# Start dev server
bun run dev

# Or run CLI directly
bun src/index.ts start

# Or start production build
./dist-exe/cerebro start

# Web UI available at http://localhost:3030
```

## API Endpoints

### Diff & Files

- `GET /api/diff?repo=<id>&mode=<branch|working|staged>` - Get diff files
- `POST /api/mark-viewed` - Mark file as reviewed
- `POST /api/unmark-viewed` - Unmark file
- `POST /api/stage` - Stage file
- `POST /api/unstage` - Unstage file
- `POST /api/discard` - Discard changes
- `POST /api/commit` - Create commit

### Repository Management

- `GET /api/repos` - List repositories
- `POST /api/repos` - Add repository
- `DELETE /api/repos/:id` - Remove repository
- `GET /api/health` - Health check endpoint

### Comments & Notes

- `GET /api/comments?repo=<id>` - Get comments
- `POST /api/comments` - Add comment
- `POST /api/comments/resolve` - Resolve comment
- `GET /api/notes?repo=<id>` - Get notes
- `POST /api/notes/dismiss` - Dismiss note

## State Storage

All state is stored in `~/.config/cerebro/`:

```
~/.config/cerebro/
├── config.json           # Global configuration
├── repos.json            # Registered repositories
└── repos/
    └── <repo-id>/
        ├── comments.json # Per-repo comments
        ├── notes.json    # Per-repo notes
        └── viewed.json   # Viewed files state
```

## Code Patterns

### Adding a New API Endpoint

1. Add route handler in `src/server/routes/`
2. Define request/response types in `src/types/`
3. Update frontend API client in `web/src/api/`
4. Add tests

### Adding State Persistence

1. Define data structure in `src/types/`
2. Add methods to appropriate state module in `src/state/`
3. Use async file operations with Bun's native APIs
4. Handle missing/corrupted files gracefully

### Working with Git Operations

```typescript
import { getGitManager } from '../git';

const git = getGitManager(repoPath);
const diff = await git.getDiff({ baseBranch: 'main', mode: 'branch' });
const status = await git.status();
```

## Single Binary Build

The `scripts/build-executable.ts` script:
1. Builds React app via `web/build.ts`
2. Reads all dist files and encodes as base64
3. Generates embedded server code
4. Uses `bun build --compile` to create single binary

```bash
bun run build
# Output: dist-exe/cerebro (single executable)
```

## macOS App Architecture

### ServerManager

- Locates bundled `cerebro` binary (or dev/system paths)
- Spawns process with proper environment
- Health check polling every 2 seconds via `/api/health`
- Auto-restart on crash (max 3 attempts)
- Uses os.log for logging (Console.app)

### CLIInstaller

- Copies bundled binary to `~/.local/bin/cerebro`
- No sudo required (user-writable directory)

### WebViewController

- WKWebView loading `http://localhost:PORT`
- JavaScript bridge for native features:
  - `cerebroBridge.openInFinder(path)` - Reveal in Finder
  - `cerebroBridge.openTerminal(path)` - Open iTerm/Terminal
  - `cerebroBridge.showNotification(title, body)` - System notification

### MenuManager

- Menu bar icon and dropdown
- Open window, install CLI, quit actions

## AI Agent Best Practices

When modifying this codebase:

1. **Use Bun APIs** - Prefer `Bun.file()`, `Bun.write()`, `Bun.serve()` over Node.js equivalents
2. **Type safety** - All code is TypeScript, maintain strict types
3. **State consistency** - Always use state management modules, don't access files directly
4. **Error handling** - Git operations can fail, handle gracefully
5. **XDG compliance** - Use `~/.config/cerebro/` for config
6. **No sudo** - CLI installer uses user-writable paths

## Key Dependencies

- `bun` - Runtime and bundler
- `simple-git` - Git operations
- `commander` - CLI framework
- `react` - Frontend UI
- `@pierre/precision-diffs` - Diff rendering
- `vite` - Frontend dev server

## Performance Considerations

- Diffs computed on-demand (consider caching for large repos)
- State files loaded/saved synchronously (small files, acceptable)
- Single binary embeds all assets (fast startup, no I/O for static files)
- WebView shares system WebKit (low memory overhead)

## Security Notes

- Server only listens on `127.0.0.1` (localhost)
- No authentication (local-only tool)
- No remote data transmission

---

## CLI Reference for AI Agents

The CLI at `~/.local/bin/cerebro` provides full programmatic access. Use these commands instead of the web UI for automation.

### Repository Management

```bash
# Add current directory as a repo
cerebro repo add .

# Add specific path
cerebro repo add /path/to/repo

# List all tracked repos
cerebro repo list

# Remove a repo by ID
cerebro repo remove <id>

# Set current repo
cerebro repo set-current <id>
```

### Comments (Code Review Feedback)

```bash
# List all comments for current repo
cerebro comments list

# List comments for specific repo
cerebro comments list --repo <id-or-path>

# List comments filtered by branch
cerebro comments list --branch feature-xyz

# Add a comment to a file
cerebro comments add "This needs refactoring" \
  --file src/main.ts \
  --line 42 \
  --branch main \
  --commit abc1234

# Add comment (auto-detects branch/commit from git)
cerebro comments add "Fix error handling" --file src/api.ts --line 100

# Resolve a comment
cerebro comments resolve <comment-id>
cerebro comments resolve <comment-id> --by "ai-agent"
```

### Notes (Explanations/Suggestions)

```bash
# List all notes
cerebro notes list
cerebro notes list --repo <id-or-path>
cerebro notes list --branch main

# Add a note (type: explanation, rationale, suggestion)
cerebro notes add "This function handles OAuth2 token refresh" \
  --file src/auth.ts \
  --line 50 \
  --type explanation \
  --author "ai-agent"

# Add a suggestion
cerebro notes add "Consider using async/await here" \
  --file src/api.ts \
  --line 30 \
  --type suggestion \
  --author "ai-agent"

# Add rationale
cerebro notes add "Using Map for O(1) lookup performance" \
  --file src/cache.ts \
  --line 15 \
  --type rationale \
  --author "ai-agent"

# Dismiss a note
cerebro notes dismiss <note-id>
cerebro notes dismiss <note-id> --by "reviewer"
```

### Server Control

```bash
# Start server (auto-detects repo in cwd)
cerebro start

# Start with specific repo
cerebro start /path/to/repo

# Start on custom port and open browser
cerebro start -p 4000 -o

# Show config
cerebro config show

# Set base branch for current repo
cerebro config set base-branch develop
```

### Typical AI Agent Workflow

```bash
# 1. Ensure repo is tracked
cerebro repo add .

# 2. Review code and add comments
cerebro comments add "Missing null check" -f src/handler.ts -l 42

# 3. Add explanatory notes
cerebro notes add "Rate limiting prevents API abuse" \
  -f src/middleware.ts -l 20 -t rationale -a "ai-agent"

# 4. List open comments to address
cerebro comments list --branch $(git branch --show-current)

# 5. Resolve after fixing
cerebro comments resolve abc123 --by "ai-agent"
```

### Options Reference

| Command | Required | Optional |
|---------|----------|----------|
| `comments add <text>` | `--file` | `--line`, `--branch`, `--commit`, `--repo` |
| `comments resolve <id>` | | `--repo`, `--by` |
| `comments list` | | `--repo`, `--branch` |
| `notes add <text>` | `--file`, `--line` | `--type`, `--author`, `--branch`, `--commit`, `--repo` |
| `notes dismiss <id>` | | `--repo`, `--by` |
| `notes list` | | `--repo`, `--branch` |

Note types: `explanation` (default), `rationale`, `suggestion`
