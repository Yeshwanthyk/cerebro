# 01 - Main Entry Point (main.go)

## What This File Does

`main.go` is the **entry point** - the first code that runs when you type `cerebro`.

It defines all CLI commands and routes them to handler functions.

---

## Visual: Command Tree

```
cerebro
│
├── (no args) ─────────────► openBrowser()
│                            Opens the web UI in your browser
│
├── start ─────────────────► startServerForeground()
│   --port, --base, --mode   Runs server in foreground (blocking)
│
├── init ──────────────────► printShellIntegration()
│                            Prints shell script for auto-start
│
├── daemon ────────────────► Daemon subcommands
│   ├── start              → startDaemon()     Spawn background server
│   ├── stop               → stopDaemon()      Kill this repo's daemon
│   ├── stop-all           → stopAllDaemons()  Kill all daemons
│   ├── list               → listDaemons()     Show running daemons
│   └── cleanup            → cleanupDaemons()  Remove stale entries
│
├── config ────────────────► Configuration subcommands
│   ├── set <key> <val>    → setConfig()
│   ├── get <key>          → getConfig()
│   └── show               → showConfig()
│
├── mcp ───────────────────► mcpStdio()
│                            Start MCP server for AI agents
│
├── comments ──────────────► Comment management
│   ├── list               → commands.ListComments()
│   └── resolve <id>       → commands.ResolveComment()
│
├── notes ─────────────────► AI agent notes
│   ├── add                → commands.AddNote()
│   ├── list               → commands.ListNotes()
│   └── dismiss <id>       → commands.DismissNote()
│
└── dev ───────────────────► Development utilities
    └── sample-notes       → addSampleNotes()
```

---

## Key Function: startServerForeground()

This is the core function that starts everything:

```
startServerForeground()
        │
        ▼
┌───────────────────┐
│ 1. Open git repo  │ ◄── git.Open(".")
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 2. Get repo path  │ ◄── Where is this repo on disk?
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 3. Load config    │ ◄── Base branch, mode settings
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 4. Auto-detect    │ ◄── If base branch is "main", check if repo
│    base branch    │     actually uses "master" or something else
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 5. Find free port │ ◄── Random available port
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 6. Register daemon│ ◄── Track this server in daemon manager
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 7. Start server!  │ ◄── server.Start(port, baseBranch, mode)
└───────────────────┘
```

---

## Key Function: startDaemon()

Spawns a **background** server process:

```
startDaemon()
      │
      ├── Is CEREBRO_DAEMON=1 set?
      │         │
      │    YES  │  NO
      │         │
      │         ▼
      │   ┌─────────────────┐
      │   │ Spawn new       │
      │   │ process with    │
      │   │ CEREBRO_DAEMON=1│
      │   └────────┬────────┘
      │            │
      │            ▼
      │   ┌─────────────────┐
      │   │ Parent returns  │
      │   │ (non-blocking)  │
      │   └─────────────────┘
      │
      ▼
┌─────────────────┐
│ Child process:  │
│ Actually runs   │
│ the server      │
└─────────────────┘
```

This is a common pattern called **double-fork daemonization** (simplified).

---

## Imports - What Each Package Does

```go
import (
    "github.com/Yeshwanthyk/cerebro/internal/cli/commands"  // CLI helpers
    "github.com/Yeshwanthyk/cerebro/internal/config"        // Load/save config
    "github.com/Yeshwanthyk/cerebro/internal/daemon"        // Manage background processes
    "github.com/Yeshwanthyk/cerebro/internal/git"           // Git operations
    "github.com/Yeshwanthyk/cerebro/internal/mcp"           // AI integration
    "github.com/Yeshwanthyk/cerebro/internal/server"        // HTTP API
    "github.com/Yeshwanthyk/cerebro/internal/state"         // Persistent storage
    
    "github.com/urfave/cli/v2"   // CLI framework
    "github.com/fatih/color"    // Colored terminal output
)
```

---

## Shell Integration (cerebro init)

When you run `eval "$(cerebro init)"`, it adds hooks to your shell:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Shell Integration Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   You cd into a git repo                                        │
│           │                                                     │
│           ▼                                                     │
│   ┌───────────────────┐                                        │
│   │ _cerebro_auto_    │                                        │
│   │ manage() runs     │ ◄── Hook on every cd                   │
│   └─────────┬─────────┘                                        │
│             │                                                   │
│             ▼                                                   │
│   ┌───────────────────┐     ┌───────────────────┐              │
│   │ Left old repo?    │────►│ Stop old daemon   │              │
│   └─────────┬─────────┘     └───────────────────┘              │
│             │                                                   │
│             ▼                                                   │
│   ┌───────────────────┐     ┌───────────────────┐              │
│   │ Entered new repo? │────►│ Start new daemon  │              │
│   └───────────────────┘     └───────────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Questions to Think About

1. Why does `startDaemon()` check for `CEREBRO_DAEMON=1`?
2. What happens if you run `cerebro` without a daemon running?
3. How does the shell integration know if you're in a git repo?

---

## Next

Learn how the daemon manager tracks background processes:

```bash
cat docs/learn/02-daemon.md
```
