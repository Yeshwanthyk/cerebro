# Cerebro
<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->
[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors-)
<!-- ALL-CONTRIBUTORS-BADGE:END -->

A Git diff review tool with a web interface, inspired by GitHub's pull request UI. Cerebro runs as a background daemon that automatically starts when you enter a git repository.

## Features

- 🤖 **Auto-start daemon** - Automatically starts a server when you cd into a git repo
- 🌐 **Web-based interface** - Review diffs in your browser with a GitHub-like UI
- 📁 **File-by-file diff viewing** - Expand and review individual files
- ✅ **Mark files as viewed** - Track your review progress
- 💬 **Inline comments** - Add comments to specific lines of code
- 💾 **Persistent state** - Remembers what you've reviewed using XDG conventions
- 🎨 **GitHub-inspired dark theme** - Familiar and easy on the eyes
- ⚡ **Built with Go** - Fast, simple, and efficient
- 🔌 **Automatic port allocation** - Each repository gets its own port
- 🤖 **MCP Server Integration** - Allows LLMs like Claude to query and resolve review comments

## Quick Start

### Installation

```bash
# Using mise (recommended)
mise use -g github:Yeshwanthyk/cerebro@latest

# Or download from releases
# https://github.com/Yeshwanthyk/cerebro/releases
```

### Setup

Add to your shell configuration (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
eval "$(cerebro init)"
```

### Usage

```bash
cd /path/to/your/repo  # Daemon starts automatically
cerebro                   # Opens browser to review diffs
```

## MCP Integration

### Option 1: Claude Desktop Integration

Add to your Claude Desktop configuration:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "cerebro": {
      "command": "/path/to/cerebro",
      "args": ["mcp"]
    }
  }
}
```

Restart Claude Code, and you can ask Claude to:
- "List all unresolved comments in this repository"
- "Show me comments on main.go"
- "Resolve comment with ID xyz"

### Option 2: Standalone CLI via mcporter

Generate a standalone `cerebro-mcp` CLI for all MCP tools:

```bash
# Install mcporter
npm install -g mcporter

# Generate CLI (run from cerebro source directory)
npx mcporter generate-cli \
  --command "/path/to/cerebro mcp" \
  --name cerebro-mcp \
  --description "Cerebro code review MCP tools" \
  --bundle dist/cerebro-mcp.js

# Install to PATH
chmod +x dist/cerebro-mcp.js
ln -s $(pwd)/dist/cerebro-mcp.js ~/commands/cerebro-mcp
```

**Usage:**
```bash
cerebro-mcp list-comments --resolved false
cerebro-mcp resolve-comment --comment-id "123-4" --resolved-by hsey
cerebro-mcp add-note --branch main --commit HEAD --file-path main.go --text "..." --author hsey
cerebro-mcp list-notes --dismissed false
cerebro-mcp dismiss-note --note-id "456-7" --dismissed-by hsey
```

## Documentation

For comprehensive documentation, see [docs/README.md](docs/README.md):

- [Installation & Setup](docs/README.md#installation)
- [Usage Guide](docs/README.md#usage)
- [MCP Server Integration](docs/README.md#mcp-server-integration)
- [Development](docs/README.md#development)
- [Architecture](docs/README.md#architecture)
- [Troubleshooting](docs/README.md#troubleshooting)

## Common Commands

```bash
# Daemon management
cerebro daemon start      # Start daemon manually
cerebro daemon stop       # Stop current repo's daemon
cerebro daemon list       # List all running daemons
cerebro daemon stop-all   # Stop all daemons

# Configuration
cerebro config set base-branch develop
cerebro config show
```

## How It Works

1. **Shell Integration**: Automatically starts a server when you `cd` into a git repository
2. **Daemon Management**: Each repository gets its own background server with a unique port
3. **Web Interface**: Review diffs in your browser, mark files as viewed, add inline comments
4. **State Persistence**: Everything is saved locally and associated with repo/branch/commit
5. **MCP Integration**: LLMs like Claude can query and resolve comments through the MCP protocol

