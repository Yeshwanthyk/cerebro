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
   - SwiftUI menu bar application
   - Manages Bun server process
   - WebView for UI display
   - CLI installer

7. **MCP Integration** (`src/mcp/`)
   - Model Context Protocol server for LLM integration
   - Tools: `list_comments`, `resolve_comment`, `add_note`, `list_notes`, `dismiss_note`

## File Organization

```
cerebro/
├── src/                      # Bun application source
│   ├── index.ts              # Main entry point
│   ├── server/
│   │   ├── index.ts          # Bun.serve() setup
│   │   └── routes/           # API route handlers
│   ├── cli/
│   │   ├── index.ts          # CLI entry point
│   │   └── commands/         # Command implementations
│   ├── git/                  # Git operations
│   ├── state/                # State persistence
│   ├── mcp/                  # MCP server
│   └── types/                # Shared types
├── web/                      # React frontend
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── DiffView.tsx
│   │   │   ├── FileCard.tsx
│   │   │   └── RepoPicker.tsx
│   │   ├── hooks/
│   │   └── api/
│   ├── build-executable.ts   # Single binary builder
│   └── package.json
├── mac/                      # macOS app
│   ├── Sources/
│   │   ├── CerebroApp.swift
│   │   └── CerebroKit/
│   ├── scripts/
│   └── Package.swift
├── package.json              # Root package.json
├── tsconfig.json
└── bunfig.toml
```

## Development Workflow

### Prerequisites

- Bun 1.3.2+
- Node.js 20+ (for some dev tools)
- Xcode 15+ (for macOS app)

### Building

```bash
# Install dependencies
bun install

# Development mode (hot reload)
bun run dev

# Build production binary
bun run build

# Build macOS app
cd mac && ./scripts/build.sh
```

### Testing

```bash
bun test
```

### Running Locally

```bash
# Start dev server
bun run dev

# Or start production build
./dist/cerebro start

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

The `build-executable.ts` script:
1. Builds React app with Vite
2. Reads all dist files and encodes as base64
3. Generates embedded server code
4. Uses `bun build --compile` to create single binary

```bash
bun run build:exe
# Output: dist/cerebro (single executable)
```

## macOS App Architecture

### ServerManager

- Locates bundled `cerebro-server` binary
- Spawns process with proper environment
- Health check polling every 2 seconds
- Auto-restart on crash (max 3 attempts)

### CLIInstaller

- Copies bundled binary to `~/.local/bin/cerebro`
- No sudo required (user-writable directory)
- Version checking and update prompts

### WebViewController

- WKWebView loading `http://localhost:PORT`
- JavaScript bridge for native features
- Navigation handling

## AI Agent Best Practices

When modifying this codebase:

1. **Use Bun APIs** - Prefer `Bun.file()`, `Bun.write()`, `Bun.serve()` over Node.js equivalents
2. **Type safety** - All code is TypeScript, maintain strict types
3. **State consistency** - Always use state management modules, don't access files directly
4. **Error handling** - Git operations can fail, handle gracefully
5. **XDG compliance** - Use `~/.config/cerebro/` for config, `~/.local/share/cerebro/` for data
6. **No sudo** - CLI installer uses user-writable paths
7. **MCP schema sync** - When modifying MCP tools, update both implementation and schema

## Key Dependencies

- `bun` - Runtime and bundler
- `simple-git` - Git operations
- `commander` - CLI framework
- `react` - Frontend UI
- `@pierre/precision-diffs` - Diff rendering
- `vite` - Frontend build tool

## Performance Considerations

- Diffs computed on-demand (consider caching for large repos)
- State files loaded/saved synchronously (small files, acceptable)
- Single binary embeds all assets (fast startup, no I/O for static files)
- WebView shares system WebKit (low memory overhead)

## Security Notes

- Server only listens on `127.0.0.1` (localhost)
- No authentication (local-only tool)
- No remote data transmission
- macOS app sandboxed (optional for distribution)
