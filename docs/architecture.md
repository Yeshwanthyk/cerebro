# Cerebro Architecture

## Overview

Cerebro is a Git diff review tool with three main components:

```
┌─────────────────────────────────────────────────────────────┐
│                     macOS App (Swift)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ MenuManager │  │ServerManager│  │ WebViewController   │  │
│  └─────────────┘  └──────┬──────┘  └──────────┬──────────┘  │
│                          │                    │             │
└──────────────────────────┼────────────────────┼─────────────┘
                           │spawns              │WKWebView
                           ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                    Bun Server (TypeScript)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐  │
│  │   CLI    │  │  Server  │  │   Git    │  │    State    │  │
│  │ commands │  │ handlers │  │ manager  │  │  (SQLite)   │  │
│  └──────────┘  └────┬─────┘  └──────────┘  └─────────────┘  │
│                     │REST API                               │
└─────────────────────┼───────────────────────────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   React Frontend                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────────┐   │
│  │  Hooks   │  │   API    │  │ Components (DiffView,    │   │
│  │(useDiff) │  │  client  │  │  FileTree, Comments...)  │   │
│  └──────────┘  └──────────┘  └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Components

### Bun Server (`src/`)

The core application, packaged as a single executable:

| Module | Purpose |
|--------|---------|
| `cli/` | Commander-based CLI for `cerebro start`, `repo`, `comments`, etc. |
| `server/` | HTTP server with REST API handlers |
| `server/handlers/` | Request handlers (repos, diff, comments, notes, git ops) |
| `server/routes.ts` | Route table shared between production and dev servers |
| `git/` | Git operations via `simple-git` |
| `state/` | SQLite-backed persistence for repos, comments, notes, viewed files |
| `schemas/` | Zod validation schemas for API requests |
| `types/` | Shared TypeScript interfaces |

### React Frontend (`web/`)

Single-page application bundled with Bun:

| Module | Purpose |
|--------|---------|
| `api/` | REST client for server communication |
| `hooks/` | React hooks (`useDiff`, etc.) |
| `components/` | UI components (DirectoryPicker, etc.) |
| `src/images/` | Static assets (canonical location) |

### macOS App (`mac/`)

Native Swift application:

| Module | Purpose |
|--------|---------|
| `CerebroApp.swift` | App delegate, menu bar setup |
| `ServerManager.swift` | Spawns/monitors Bun server process |
| `WebViewController.swift` | WKWebView with JS bridge |
| `MenuManager.swift` | Menu bar dropdown |
| `CLIInstaller.swift` | Installs CLI to `~/.local/bin/` |

## Data Flow

### Viewing a Diff

```
User opens file in UI
       │
       ▼
React calls GET /api/file-diff?file=path
       │
       ▼
handleGetFileDiff (server/handlers/diff.ts)
       │
       ▼
GitManager.getFileDiff (git/index.ts)
       │
       ▼
simple-git: git diff --no-color
       │
       ▼
Parse raw diff → FileDiff object
       │
       ▼
JSON response → React renders diff
```

### Adding a Comment

```
User submits comment
       │
       ▼
React calls POST /api/comments
       │
       ▼
handleAddComment (server/handlers/comments.ts)
       │
       ▼
Validate with Zod schema
       │
       ▼
state.addComment (state/index.ts)
       │
       ▼
SQLite INSERT → comments table
       │
       ▼
Return comment object
```

## Build Pipeline

```
Source Files
     │
     ├── web/src/*.tsx ──────► Bun.build ──────► web/dist/
     │                                              │
     │                                              ▼
     └── src/*.ts ──────────────────────► scripts/build-executable.ts
                                                    │
                                                    │ embeds web/dist as base64
                                                    ▼
                                          Bun --compile
                                                    │
                                                    ▼
                                          dist-exe/cerebro (single binary)
                                                    │
                                                    ▼
                                          mac/Makefile
                                                    │
                                                    ▼
                                          Cerebro.app (bundles binary)
```

## State Storage

All state lives in `~/.config/cerebro/`:

```
~/.config/cerebro/
├── cerebro.db           # SQLite database
│   ├── repos            # Registered repositories
│   ├── comments         # Review comments
│   ├── notes            # AI-generated notes
│   └── viewed_files     # Per-branch/commit viewed state
└── config.json          # Global settings (port, etc.)
```

## Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Server | `bun --hot web/src/dev-server.ts` | Embedded in binary |
| Frontend | Bun HMR | Static files embedded as base64 |
| Assets | Served from `web/src/images/` | Embedded in binary |
| State | Same SQLite DB | Same SQLite DB |

Both use the same route handlers from `src/server/handlers/`.
