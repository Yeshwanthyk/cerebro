# Cerebro Learning Guide

## How to Use This Guide

Work through these docs in order. Each file builds on the previous one.

```
docs/learn/
├── 00-overview.md        ◄── YOU ARE HERE (start here!)
├── 01-main-entry.md      ◄── CLI entry point & commands
├── 02-daemon.md          ◄── Background process management
├── 03-git.md             ◄── Git operations (diffs, branches)
├── 04-config.md          ◄── Configuration management
├── 05-state.md           ◄── Persistent storage (comments, notes)
├── 06-server.md          ◄── HTTP API server
├── 07-mcp.md             ◄── AI agent integration (MCP protocol)
└── 08-frontend.md        ◄── React web interface
```

---

## What is Cerebro?

Cerebro is a **Git diff review tool** that helps you visualize changes in your code.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        HOW CEREBRO WORKS                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   You enter a git repo                                              │
│         │                                                           │
│         ▼                                                           │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐          │
│   │   cerebro   │────►│   daemon    │────►│   server    │          │
│   │    (CLI)    │     │ (background)│     │ (HTTP API)  │          │
│   └─────────────┘     └─────────────┘     └─────────────┘          │
│                                                  │                  │
│                                                  ▼                  │
│                              ┌─────────────────────────────────┐   │
│                              │     Web Browser (React UI)      │   │
│                              │  - View file diffs              │   │
│                              │  - Add comments                 │   │
│                              │  - See AI agent notes           │   │
│                              └─────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Architecture at a Glance

```
cerebro/
│
├── main.go                 ← Entry point (CLI commands)
│
├── internal/               ← All backend logic
│   ├── cli/commands/       ← CLI command implementations
│   ├── config/             ← TOML config loading/saving
│   ├── daemon/             ← Background process manager
│   ├── git/                ← Git operations (go-git library)
│   ├── mcp/                ← Model Context Protocol (AI integration)
│   ├── server/             ← HTTP API + serves frontend
│   └── state/              ← Persistent data (comments, notes, viewed files)
│
└── web/                    ← Frontend (React + Vite + TypeScript)
    ├── src/
    │   ├── App.tsx         ← Main React component
    │   ├── components/     ← UI components
    │   └── hooks/          ← React hooks
    └── index.html
```

---

## Data Flow

```
┌──────────┐    HTTP     ┌──────────┐    go-git    ┌──────────┐
│ Frontend │◄───────────►│  Server  │◄────────────►│   Git    │
│  (React) │             │  (Go)    │              │   Repo   │
└──────────┘             └────┬─────┘              └──────────┘
                              │
                              ▼
                        ┌──────────┐
                        │  State   │
                        │  (JSON   │
                        │  files)  │
                        └──────────┘
```

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Daemon** | Background server that runs per repository |
| **Base Branch** | The branch you're comparing against (e.g., `main`) |
| **Mode** | How to compute diffs: `branch`, `working`, `staged` |
| **State** | Persistent data stored in `~/.local/share/cerebro/` |
| **MCP** | Protocol for AI agents to interact with Cerebro |

---

## Next Steps

Open the next file to learn about the CLI entry point:

```bash
# Read the next doc
cat docs/learn/01-main-entry.md
```

Or ask me any questions about this overview!
