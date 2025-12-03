# Cerebro
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

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
- **Native macOS app** - Menu bar app with global hotkey support
- **MCP Server Integration** - Allows LLMs like Claude to query and resolve review comments

## Quick Start

### macOS App

Download `Cerebro.app` from the releases page and drag to Applications.

The app lives in your menu bar and provides:
- One-click access to the review UI
- Global hotkey (Ctrl+Opt+Cmd+C) to open window
- CLI installation for terminal usage

### CLI Installation

From the menu bar app, click "Install CLI Tool..." to add `cerebro` to your PATH.

Or manually:

```bash
# The CLI is bundled in the app
~/.local/bin/cerebro --help
```

### Usage

```bash
# Start server for a repository
cerebro start /path/to/repo

# Or use the app - it auto-manages the server
```

## MCP Integration

### Claude Desktop Integration

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

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

Restart Claude, and you can ask Claude to:
- "List all unresolved comments in this repository"
- "Show me comments on main.go"
- "Resolve comment with ID xyz"

## CLI Commands

```bash
# Server management
cerebro start [path]         # Start server for a repo (defaults to cwd)
cerebro start -p 3030        # Start on specific port

# Repository management
cerebro repo add <path>      # Add a repository
cerebro repo list            # List tracked repositories
cerebro repo remove <id>     # Remove a repository

# Configuration
cerebro config set base-branch develop
cerebro config show

# MCP mode
cerebro mcp                  # Start MCP server for AI integration
```

## How It Works

1. **Repository Tracking**: Add repos via the UI or CLI
2. **Server Management**: The macOS app manages the Bun server process
3. **Web Interface**: Review diffs in your browser, mark files as viewed, add inline comments
4. **State Persistence**: Everything is saved locally in `~/.config/cerebro/`
5. **MCP Integration**: LLMs like Claude can query and resolve comments

## Development

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Build single binary
bun run build

# Build macOS app
cd mac && ./scripts/build.sh
```

## Architecture

- **Bun server** - HTTP API and static file serving
- **React frontend** - GitHub-inspired diff viewer
- **macOS wrapper** - SwiftUI menu bar app
- **simple-git** - Git operations

## License

MIT
