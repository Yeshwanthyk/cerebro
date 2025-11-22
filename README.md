# Guck

A Git diff review tool with a web interface, inspired by GitHub's pull request UI. Guck runs as a background daemon that automatically starts when you enter a git repository.

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
- 🤖 **MCP Server Integration** - Allows LLMs to query and resolve review comments

## Installation

### Using mise (recommended)

```bash
mise use -g guck@latest
```

### Download binary

Download the latest release for your platform from the [releases page](https://github.com/tuist/guck/releases).

Binaries are available for:
- Linux (amd64, arm64)
- macOS (amd64/Intel, arm64/Apple Silicon)
- Windows (amd64)

### From source

```bash
git clone https://github.com/tuist/guck
cd guck
go build -o guck .
```

## Setup

After installing, add this to your shell configuration file (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
# For Bash/Zsh
eval "$(guck init)"
```

This enables automatic daemon management when entering/leaving git repositories.

## Usage

Once set up, simply navigate to any git repository:

```bash
cd /path/to/your/repo
# Guck daemon automatically starts in the background
```

Then open the web interface:

```bash
guck
# Opens your default browser to view the diff
```

The daemon will:
- Start automatically when you `cd` into a git repository
- Allocate a unique port for each repository
- Keep running in the background
- Persist across terminal sessions

### Manual Commands

```bash
# Open the web interface for the current repo
guck

# Start the daemon manually
guck daemon start

# Stop the daemon for the current repo
guck daemon stop

# Stop all guck daemons
guck daemon stop-all

# List all running guck servers
guck daemon list

# Clean up stale daemon entries
guck daemon cleanup

# Set the base branch (default: main)
guck config set base-branch develop

# Get current base branch
guck config get base-branch

# Show all configuration
guck config show

# Start server in foreground (useful for debugging)
guck start --port 3456

# MCP Server commands (for LLM integration)
guck mcp list-tools
echo '{"file_path": "main.go"}' | guck mcp call-tool list_comments
echo '{"comment_id": "123", "resolved_by": "llm-name"}' | guck mcp call-tool resolve_comment
```

## How it works

1. **Shell Integration**: When you `cd` into a directory, guck checks if it's a git repository
2. **Daemon Management**: If it is, guck starts a background server (if not already running)
3. **Port Mapping**: Each repository is mapped to a unique port (stored in `~/.local/state/guck/`)
4. **Web Interface**: Run `guck` to open your browser to the appropriate port
5. **Diff Review**: Review changes against your base branch, mark files as viewed, add comments
6. **State Persistence**: Your review progress is saved and associated with the repo, branch, and commit

The viewed state and comments are persisted locally using XDG conventions, associated with the repository path, branch name, and commit hash.

## MCP Server Integration

Guck includes a Model Context Protocol (MCP) server that allows LLMs to interact with code review comments. This enables AI assistants to:

- **Query comments**: List all comments with filtering by file, branch, commit, or resolution status
- **Resolve comments**: Mark comments as resolved while tracking who resolved them and when
- **Use current directory**: Automatically uses the current working directory when `repo_path` is not specified

### Available MCP Tools

#### `list_comments`

Lists code review comments with optional filtering.

**Parameters:**
- `repo_path` (optional): Path to the repository (defaults to current working directory)
- `branch` (optional): Filter by branch name
- `commit` (optional): Filter by commit hash
- `file_path` (optional): Filter by file path
- `resolved` (optional): Filter by resolution status (true/false)

**Example:**
```bash
echo '{"file_path": "main.go", "resolved": false}' | guck mcp call-tool list_comments
```

**Response:**
```json
{
  "result": {
    "comments": [
      {
        "id": "1234567890-0",
        "file_path": "main.go",
        "line_number": 42,
        "text": "Consider adding error handling here",
        "timestamp": 1234567890,
        "branch": "feature/new-feature",
        "commit": "abc123...",
        "resolved": false
      }
    ],
    "count": 1,
    "repo_path": "/path/to/repo"
  }
}
```

#### `resolve_comment`

Marks a comment as resolved and tracks who resolved it.

**Parameters:**
- `comment_id` (required): The ID of the comment to resolve
- `resolved_by` (required): Identifier of who/what is resolving the comment (e.g., "claude", "copilot", "user-name")
- `repo_path` (optional): Path to the repository (defaults to current working directory)

**Example:**
```bash
echo '{"comment_id": "1234567890-0", "resolved_by": "claude"}' | guck mcp call-tool resolve_comment
```

**Response:**
```json
{
  "result": {
    "success": true,
    "comment_id": "1234567890-0",
    "repo_path": "/path/to/repo",
    "resolved_by": "claude"
  }
}
```

### MCP Server Usage

1. **List available tools:**
   ```bash
   guck mcp list-tools
   ```

2. **Call a tool with parameters via stdin:**
   ```bash
   echo '{"resolved": false}' | guck mcp call-tool list_comments
   ```

3. **Integrate with your LLM/AI tool** by configuring it to use guck's MCP subcommands.

## Configuration

Guck stores its data in XDG-compliant directories:

- **State**: `~/.local/state/guck/` - Port mappings, daemon PIDs, viewed files, comments
- **Config**: `~/.config/guck/` - User configuration (base branch, etc.)

## Development

### Prerequisites

- Go 1.23 or later
- Git

### Building

```bash
go build -o guck .
```

### Running locally

```bash
# Start server in foreground
go run . start --port 3456

# Or use daemon mode
go run . daemon start
# In another terminal:
go run .
```

### Project Structure

```
.
├── main.go              # CLI entry point
├── internal/
│   ├── config/          # Configuration management
│   ├── daemon/          # Daemon process management
│   ├── git/             # Git operations and diff parsing
│   ├── mcp/             # MCP server for LLM integration
│   ├── server/          # HTTP server and API endpoints
│   │   └── static/      # Web UI (HTML/CSS/JS)
│   └── state/           # State persistence (viewed files, comments)
└── .github/workflows/   # CI/CD for releases
```

## License

MIT
