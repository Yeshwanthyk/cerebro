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
   - Commands: `start`, `repo`, `config`, `mcp`

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

7. **MCP Integration** (`src/mcp/`)
   - Model Context Protocol server for LLM integration
   - Tools: `list_comments`, `resolve_comment`, `add_note`, `list_notes`, `dismiss_note`

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
7. **MCP schema sync** - When modifying MCP tools, update both implementation and schema

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
