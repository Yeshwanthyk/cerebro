# Guck

A Git diff review tool with a web interface, inspired by GitHub's pull request UI.

## Features

- 🌐 Web-based interface for reviewing git diffs
- 📁 File-by-file diff viewing with syntax highlighting
- ✅ Mark files as viewed to track review progress
- 💾 Persistent state using XDG conventions
- 🎨 GitHub-inspired dark theme UI
- ⚡ Built with Rust for performance

## Installation

Download the latest release for your platform from the [releases page](https://github.com/tuist/guck/releases).

### From source

```bash
cargo install --git https://github.com/tuist/guck
```

## Usage

Navigate to your git repository and run:

```bash
guck start
```

This will start a web server on `http://localhost:3000` (default port) where you can review the diff between your current branch and `main`.

### Options

```bash
# Use a different port
guck start --port 8080

# Compare against a different base branch
guck start --base develop
```

## How it works

Guck compares your current branch against a base branch (default: `main`) and presents the differences in a web interface. You can:

1. View the list of changed files
2. Click on any file to expand and see the diff
3. Mark files as viewed to track your progress

The viewed state is persisted locally using XDG conventions, associated with the repository path, branch name, and commit hash.

## Development

### Prerequisites

- Rust 1.70 or later
- Git

### Building

```bash
cargo build --release
```

### Running locally

```bash
cargo run -- start
```

## License

MIT
