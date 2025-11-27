# 02 - Daemon Manager (internal/daemon/)

## What This Package Does

Manages **background server processes** - one per git repository.

Think of it like a process registry that tracks which servers are running where.

---

## Visual: How Daemons Work

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DAEMON LIFECYCLE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   cerebro daemon start                                              │
│          │                                                          │
│          ▼                                                          │
│   ┌─────────────────┐                                              │
│   │ Is daemon       │──── YES ──► Return (already running)         │
│   │ already running?│                                              │
│   └────────┬────────┘                                              │
│            │ NO                                                     │
│            ▼                                                        │
│   ┌─────────────────┐                                              │
│   │ Find free port  │ ◄── Random port between 3000-9000            │
│   └────────┬────────┘                                              │
│            │                                                        │
│            ▼                                                        │
│   ┌─────────────────┐     ┌───────────────────────────┐            │
│   │ Spawn process   │────►│ New process runs server   │            │
│   └────────┬────────┘     │ (child process)           │            │
│            │              └───────────────────────────┘            │
│            ▼                                                        │
│   ┌─────────────────┐                                              │
│   │ Register in     │                                              │
│   │ registry JSON   │                                              │
│   └─────────────────┘                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Structures

### Info - Represents one running daemon

```go
type Info struct {
    PID        int       // Process ID (to check if still running)
    Port       int       // HTTP port it's listening on
    RepoPath   string    // Which git repo this daemon serves
    BaseBranch string    // Branch to compare against
    Mode       string    // "branch", "working", or "staged"
}
```

### Registry - All daemons tracked in one file

```go
type Registry struct {
    Daemons map[string]*Info   // Key = repo path
}
```

Stored at: `~/.local/state/cerebro/daemon-registry.json`

```json
{
  "daemons": {
    "/Users/you/projects/myapp": {
      "pid": 12345,
      "port": 4521,
      "repo_path": "/Users/you/projects/myapp",
      "base_branch": "main",
      "mode": "branch"
    },
    "/Users/you/projects/another": {
      "pid": 12399,
      "port": 3877,
      ...
    }
  }
}
```

---

## Manager Methods

```
┌─────────────────────────────────────────────────────────────────┐
│                        Manager                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  NewManager()          Create a new daemon manager              │
│       │                                                         │
│       ▼                                                         │
│  ┌────────────────────────────────────────────────────────┐    │
│  │                                                        │    │
│  │  FindAvailablePort()    Find unused port (3000-9000)  │    │
│  │                                                        │    │
│  │  GetDaemonForRepo()     Look up daemon for a repo     │    │
│  │                                                        │    │
│  │  RegisterDaemon()       Add daemon to registry        │    │
│  │                                                        │    │
│  │  UnregisterDaemon()     Remove daemon from registry   │    │
│  │                                                        │    │
│  │  ListDaemons()          Get all registered daemons    │    │
│  │                                                        │    │
│  │  IsDaemonRunning()      Check if PID is still alive   │    │
│  │                                                        │    │
│  │  StopDaemon()           Send SIGTERM to kill process  │    │
│  │                                                        │    │
│  │  CleanupStaleDaemons()  Remove dead entries           │    │
│  │                                                        │    │
│  │  GetLogPath()           Where to write daemon logs    │    │
│  │                                                        │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## How Port Finding Works

```
FindAvailablePort()
       │
       ▼
┌──────────────────┐
│ Load registry    │ ◄── Get all ports already in use
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Random port      │ ◄── Pick random 3000-9000
│ 3000-9000        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Is port in use   │──── YES ──► Try again (max 100 attempts)
│ by registry?     │
└────────┬─────────┘
         │ NO
         ▼
┌──────────────────┐
│ Can we bind to   │──── NO ───► Try again
│ the port? (TCP)  │
└────────┬─────────┘
         │ YES
         ▼
    Return port
```

---

## Process Health Check

How `IsDaemonRunning()` works:

```go
// Send signal 0 - doesn't actually send anything,
// just checks if process exists and we have permission
err = process.Signal(syscall.Signal(0))
return err == nil  // nil = process exists
```

This is a Unix trick! Signal 0 is a "null signal" that just validates the process.

---

## File Storage (XDG Convention)

```
~/.local/state/cerebro/
├── daemon-registry.json     ◄── All daemon info
├── _Users_you_projects_myapp.log    ◄── Logs for myapp daemon
└── _Users_you_projects_other.log    ◄── Logs for other daemon
```

The log filenames are the repo path with `/` replaced by `_`.

---

## Questions to Think About

1. What happens if a daemon crashes without being unregistered?
2. Why use random ports instead of sequential ones?
3. How does `CleanupStaleDaemons()` prevent zombie entries?

---

## Next

Learn how git operations work:

```bash
cat docs/learn/03-git.md
```
