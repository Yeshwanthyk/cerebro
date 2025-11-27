# 08 - Frontend (web/)

## What This Package Does

A **React + TypeScript** single-page app that displays git diffs in a nice UI.

Built with:
- **Vite** - Fast build tool
- **React 18** - UI framework
- **TypeScript** - Type safety

---

## Visual: Frontend Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      FRONTEND ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   web/src/                                                          │
│       │                                                             │
│       ├── main.tsx        ← Entry point, renders <App />            │
│       │                                                             │
│       ├── App.tsx         ← Main component, orchestrates everything │
│       │      │                                                      │
│       │      ├── useDiff() hook                                    │
│       │      │      │                                               │
│       │      │      └── Fetches /api/diff, /api/comments, etc.     │
│       │      │                                                      │
│       │      └── Renders <FileCard /> for each file                │
│       │                                                             │
│       ├── components/                                               │
│       │      ├── FileCard.tsx   ← One changed file                 │
│       │      └── DiffView.tsx   ← Unified/split diff display       │
│       │                                                             │
│       ├── hooks/                                                    │
│       │      └── useDiff.ts     ← Data fetching & state            │
│       │                                                             │
│       ├── api/                                                      │
│       │      └── types.ts       ← TypeScript interfaces            │
│       │                                                             │
│       └── index.css             ← All styles                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component Hierarchy

```
<App />
  │
  ├── <header>           ← Branch name, mode switcher, commit button
  │
  ├── <progress>         ← "3 of 10 files reviewed" bar
  │
  ├── <main>
  │     │
  │     └── <FileCard /> × N    ← One per changed file
  │           │
  │           ├── Header (path, +/- stats, expand/collapse)
  │           │
  │           └── <DiffView />  ← The actual diff content
  │                 │
  │                 ├── Unified view (single column)
  │                 └── Split view (side-by-side)
  │
  └── Modals
        ├── Shortcuts modal (?key)
        ├── Confirm discard modal
        └── Comment modal
```

---

## The useDiff() Hook

This custom hook handles ALL data fetching and state:

```tsx
export function useDiff(): UseDiffResult {
    const [diff, setDiff] = useState<DiffResponse | null>(null);
    const [comments, setComments] = useState<Comment[]>([]);
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mode, setMode] = useState<DiffMode>("branch");

    // Returns all the data + action functions
    return {
        diff, comments, notes, loading, error, mode,
        setMode,
        toggleViewed,
        addComment,
        resolveComment,
        dismissNote,
        stageFile,
        unstageFile,
        discardFile,
        commit,
    };
}
```

---

## Data Flow

```
┌────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW                                   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. App mounts                                                     │
│        │                                                           │
│        ▼                                                           │
│  2. useDiff() calls fetchData()                                    │
│        │                                                           │
│        ▼                                                           │
│  3. Parallel fetch:                                                │
│        ├── GET /api/diff?mode=branch                               │
│        ├── GET /api/comments?mode=branch                           │
│        └── GET /api/notes?mode=branch                              │
│        │                                                           │
│        ▼                                                           │
│  4. Set state: diff, comments, notes                               │
│        │                                                           │
│        ▼                                                           │
│  5. App renders FileCards with data                                │
│                                                                    │
│  6. Every 3 seconds:                                               │
│        └── Re-fetch comments and notes (auto-refresh)              │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Keyboard Shortcuts

```
┌─────────────────────────────────────────────────────────────────┐
│                    KEYBOARD SHORTCUTS                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Navigation                                                     │
│  ──────────                                                     │
│  j         Next file                                            │
│  k         Previous file                                        │
│  o         Toggle expand/collapse current file                  │
│                                                                 │
│  Modes                                                          │
│  ─────                                                          │
│  1         Branch mode (vs base branch)                         │
│  2         Working mode (uncommitted changes)                   │
│  3         Staged mode (what would be committed)                │
│                                                                 │
│  UI                                                             │
│  ──                                                             │
│  n         Toggle AI notes visibility                           │
│  ?         Show shortcuts help                                  │
│  Escape    Close modals                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Implemented in `App.tsx` via `useEffect` with `keydown` listener.

---

## Mode Switcher

```tsx
<div className="mode-switcher">
    {["branch", "working", "staged"].map((m) => (
        <button
            key={m}
            className={mode === m ? "active" : ""}
            onClick={() => setMode(m)}
        >
            {m.charAt(0).toUpperCase() + m.slice(1)}
        </button>
    ))}
</div>
```

When mode changes, `useDiff()` re-fetches with new `?mode=` param.

---

## FileCard Component

Each file in the diff gets a `<FileCard />`:

```tsx
<FileCard
    file={file}                    // Path, status, additions, deletions, patch
    comments={comments}            // Comments for this file
    notes={notes}                  // AI notes for this file
    showNotes={showNotes}          // Toggle visibility
    diffStyle={diffStyle}          // "unified" or "split"
    isExpanded={isExpanded}        // Show/hide diff content
    isFocused={isFocused}          // Keyboard navigation highlight
    mode={mode}                    // Current diff mode
    onToggle={...}                 // Expand/collapse
    onToggleViewed={...}           // Mark as reviewed
    onResolveComment={...}         // Resolve a comment
    onDismissNote={...}            // Dismiss an AI note
    onStage={...}                  // git add
    onUnstage={...}                // git reset HEAD
    onDiscard={...}                // git checkout --
    onLineClick={...}              // Add comment on line
/>
```

---

## Auto-Refresh for AI Notes

Comments and notes are polled every 3 seconds:

```tsx
useEffect(() => {
    const interval = setInterval(() => {
        Promise.all([
            fetch(`/api/comments?mode=${mode}`),
            fetch(`/api/notes?mode=${mode}`),
        ]).then(async ([commentsRes, notesRes]) => {
            // Update state
        });
    }, 3000);
    
    return () => clearInterval(interval);
}, [mode]);
```

This lets AI agents add notes via MCP and they appear in the UI automatically!

---

## Optimistic Updates

When you toggle "viewed", the UI updates immediately:

```tsx
const toggleViewed = useCallback(async (filePath, currentlyViewed) => {
    // 1. Call API
    await fetch(endpoint, { ... });
    
    // 2. Update local state immediately (optimistic)
    setDiff(prev => ({
        ...prev,
        files: prev.files.map(f => 
            f.path === filePath 
                ? { ...f, viewed: !currentlyViewed } 
                : f
        )
    }));
}, []);
```

---

## Build & Development

```bash
cd web/

# Install dependencies
bun install  # or npm install

# Development server (hot reload)
bun run dev

# Production build (output to web/dist/)
bun run build
```

After building, the Go server embeds `web/dist/` into the binary.

---

## File Types (api/types.ts)

```typescript
interface DiffResponse {
    files: FileDiff[];
    branch: string;
    commit: string;
    repo_path: string;
    remote_url?: string;
    mode: string;
    base_branch: string;
}

interface FileDiff {
    path: string;
    status: "added" | "modified" | "deleted" | "renamed";
    additions: number;
    deletions: number;
    patch: string;
    viewed: boolean;
    old_file?: FileContents;
    new_file?: FileContents;
}

interface Comment {
    id: string;
    file_path: string;
    line_number?: number;
    text: string;
    timestamp: number;
    resolved: boolean;
}

interface Note {
    id: string;
    file_path: string;
    line_number: number;
    text: string;
    author: string;
    type: string;
    dismissed: boolean;
}
```

---

## Questions to Think About

1. Why poll for comments/notes instead of using WebSockets?
2. What's the benefit of optimistic updates?
3. How does the frontend know which API endpoints to call?

---

## Congratulations! 🎉

You've completed the Cerebro learning guide!

## Summary

| Layer | Package | Purpose |
|-------|---------|---------|
| CLI | `main.go` | Entry point, command routing |
| Process Mgmt | `internal/daemon` | Background server management |
| Git | `internal/git` | Diff computation, file operations |
| Config | `internal/config` | User settings (TOML) |
| State | `internal/state` | Persistent data (JSON) |
| HTTP API | `internal/server` | REST API + serve frontend |
| AI Integration | `internal/mcp` | MCP protocol for AI agents |
| Frontend | `web/` | React UI |

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   User ──► CLI ──► Daemon ──► Server ──► Git                    │
│                         │                 │                      │
│                         ▼                 ▼                      │
│                      State ◄───────► Frontend                    │
│                         ▲                                        │
│                         │                                        │
│   AI Agent ──► MCP ─────┘                                       │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

Have questions? Ask away!
