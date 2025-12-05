# Cerebro

A Git diff review tool with a web interface, inspired by GitHub's pull request UI. Cerebro provides a native macOS app for seamless code review workflows.

## Features

- **Multi-repo support** - Switch between repositories with a dropdown picker
- **Web-based interface** - Review diffs in your browser with a GitHub-like UI
- **File-by-file diff viewing** - Expand and review individual files
- **Mark files as viewed** - Track your review progress
- **Inline comments** - Add comments to specific lines of code
- **Persistent state** - Remembers what you've reviewed using XDG conventions
- **GitHub-inspired dark theme** - Familiar and easy on the eyes
- **Built with Bun** - Fast, modern, single-binary executable
- **Native macOS app** - Menu bar app that manages the server
- **MCP Integration** - Allows LLMs like Claude to query and resolve review comments

## Quick Start

### macOS App

Download `Cerebro.app` from the releases page and drag to Applications.

The app lives in your menu bar and provides:
- One-click access to the review UI
- Automatic server management
- CLI installation for terminal usage

### CLI Installation

From the menu bar app, click "Install CLI Tool..." to add `cerebro` to your PATH.

Or manually copy the binary:

```bash
cp /path/to/Cerebro.app/Contents/Resources/cerebro ~/.local/bin/
```

### Usage

```bash
# Start server for current directory
cerebro start

# Start server for a specific repository
cerebro start /path/to/repo

# Start on a specific port
cerebro start -p 3030 --open
```

## CLI Commands

```bash
# Server management
cerebro start [path]         # Start server (optional repo path)
cerebro start -p 3030        # Start on specific port
cerebro start -o             # Open browser after starting

# Repository management
cerebro repo add <path>      # Add a repository
cerebro repo list            # List tracked repositories
cerebro repo remove <id>     # Remove a repository

# Configuration
cerebro config set base-branch develop
cerebro config show

# MCP mode (for AI integration)
cerebro mcp
```

## MCP Integration

Cerebro includes an MCP server for AI assistant integration.

### Claude Desktop Setup

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "cerebro": {
      "command": "~/.local/bin/cerebro",
      "args": ["mcp"]
    }
  }
}
```

After restarting Claude, you can ask:
- "List all unresolved comments in this repository"
- "Show me comments on main.go"
- "Resolve comment with ID xyz"
- "Add a note explaining this function"

## How It Works

1. **Server**: Bun-based HTTP server serves the web UI and REST API
2. **Web UI**: React app with GitHub-inspired diff viewer
3. **macOS App**: Native wrapper that manages the server process and displays UI in a WebView
4. **State**: All data persisted locally in `~/.config/cerebro/`

## Development

```bash
# Install dependencies
bun install
cd web && bun install

# Run development server (hot reload)
bun run dev

# Build single binary
bun run build

# Build macOS app
cd mac && make release
```

### Project Structure

```
cerebro/
├── src/                  # Bun server source
│   ├── cli/              # CLI commands
│   ├── git/              # Git operations (simple-git)
│   ├── server/           # HTTP server & routes
│   ├── state/            # State persistence
│   └── types/            # Shared TypeScript types
├── web/                  # React frontend
│   ├── src/
│   │   ├── api/          # API client
│   │   ├── components/   # React components
│   │   └── hooks/        # Custom hooks
│   └── build.ts          # Vite build script
├── mac/                  # macOS app (Swift)
│   └── Sources/
│       ├── CerebroApp.swift
│       └── CerebroKit/   # Server manager, WebView, etc.
└── scripts/
    └── build-executable.ts  # Single binary builder
```

## Architecture

### macOS App

The native app is a menu bar application that:
- Spawns and manages the Bun server process
- Displays the web UI in a WKWebView
- Provides health checking with auto-restart (max 3 attempts)
- Offers native integrations via JavaScript bridge (open in Finder, terminal, notifications)

Server discovery order:
1. Bundle resources (`Cerebro.app/Contents/Resources/cerebro`)
2. Development path (`../dist-exe/cerebro`)
3. User bin (`~/.local/bin/cerebro`)
4. System PATH

### State Storage

```
~/.config/cerebro/
├── config.json           # Global configuration
├── repos.json            # Registered repositories
└── repos/<repo-id>/
    ├── comments.json     # Per-repo comments
    ├── notes.json        # Per-repo AI notes
    └── viewed.json       # Viewed files state
```

## License

MIT
