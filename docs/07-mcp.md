# 07 - MCP Integration (internal/mcp/)

## What This Package Does

Implements the **Model Context Protocol (MCP)** - a standard way for AI agents to interact with tools.

When you run `cerebro mcp`, it starts a JSON-RPC server over stdin/stdout that AI agents (like Claude) can call.

---

## Visual: How MCP Works

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MCP FLOW                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│   AI Agent (Claude, Copilot, etc.)                                 │
│        │                                                            │
│        │ JSON-RPC over stdin/stdout                                │
│        ▼                                                            │
│   ┌─────────────────────────────────────────────────────────────┐  │
│   │                    cerebro mcp                               │  │
│   │              (MCP Server Process)                            │  │
│   └────────────────────────────┬────────────────────────────────┘  │
│                                │                                    │
│        ┌───────────────────────┼───────────────────────┐           │
│        │                       │                       │           │
│        ▼                       ▼                       ▼           │
│   ┌─────────┐           ┌───────────┐          ┌───────────┐      │
│   │  list   │           │   add     │          │  resolve  │      │
│   │comments │           │   note    │          │  comment  │      │
│   └────┬────┘           └─────┬─────┘          └─────┬─────┘      │
│        │                      │                      │             │
│        └──────────────────────┼──────────────────────┘             │
│                               ▼                                     │
│                        ┌───────────┐                               │
│                        │   State   │                               │
│                        │  Manager  │                               │
│                        └───────────┘                               │
│                               │                                     │
│                               ▼                                     │
│                        ┌───────────┐                               │
│                        │viewed.json│                               │
│                        └───────────┘                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## What is MCP?

MCP (Model Context Protocol) is a standard from Anthropic for AI-tool integration:

```
┌──────────────────────────────────────────────────────────────┐
│                    MCP Protocol                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Transport: stdin/stdout (stdio) or HTTP                     │
│  Format: JSON-RPC 2.0                                        │
│                                                              │
│  Methods:                                                    │
│    initialize        → Handshake, exchange capabilities      │
│    tools/list        → List available tools                  │
│    tools/call        → Execute a tool                        │
│                                                              │
│  Flow:                                                       │
│    1. Client sends "initialize"                              │
│    2. Server responds with capabilities                      │
│    3. Client sends "tools/list"                              │
│    4. Server responds with tool definitions                  │
│    5. Client sends "tools/call" to run tools                 │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Available MCP Tools

```
┌───────────────────────────────────────────────────────────────────┐
│                        MCP TOOLS                                   │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│  list_comments                                                    │
│  ─────────────                                                    │
│  List code review comments with optional filters                  │
│  Params: repo_path, branch, commit, file_path, resolved           │
│                                                                   │
│  resolve_comment                                                  │
│  ───────────────                                                  │
│  Mark a comment as resolved                                       │
│  Params: comment_id, resolved_by, repo_path                       │
│                                                                   │
│  add_note                                                         │
│  ────────                                                         │
│  Add an AI-generated note/explanation to code                     │
│  Params: branch, commit, file_path, line_number, text,            │
│          author, type, metadata                                   │
│                                                                   │
│  list_notes                                                       │
│  ──────────                                                       │
│  List AI notes with optional filters                              │
│  Params: repo_path, branch, commit, file_path, dismissed, author  │
│                                                                   │
│  dismiss_note                                                     │
│  ────────────                                                     │
│  Mark an AI note as dismissed                                     │
│  Params: note_id, dismissed_by, repo_path                         │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
internal/mcp/
├── server.go    ← JSON-RPC server, message handling
└── mcp.go       ← Tool implementations (business logic)
```

---

## JSON-RPC Message Types

### Request (from AI agent)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "add_note",
    "arguments": {
      "branch": "feature-login",
      "commit": "abc123",
      "file_path": "src/auth.go",
      "line_number": 42,
      "text": "This function should validate input",
      "author": "claude"
    }
  }
}
```

### Response (from Cerebro)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\": \"1732500000-0\", \"file_path\": \"src/auth.go\", ...}"
      }
    ]
  }
}
```

---

## Server Message Loop

```go
func StartStdioServer() error {
    decoder := json.NewDecoder(os.Stdin)
    encoder := json.NewEncoder(os.Stdout)

    for {
        var request JSONRPCRequest
        decoder.Decode(&request)  // Read from stdin

        switch request.Method {
        case "initialize":
            response = handleInitialize(request)
        case "tools/list":
            response = handleToolsList(request)
        case "tools/call":
            response = handleToolsCall(request)
        }

        encoder.Encode(response)  // Write to stdout
    }
}
```

---

## Tool Implementation Example: add_note

```go
func AddNote(argsJSON json.RawMessage) (interface{}, error) {
    // 1. Parse parameters
    var params AddNoteParams
    json.Unmarshal(argsJSON, &params)

    // 2. Resolve repo path
    repoPath := params.RepoPath
    if repoPath == "" {
        repoPath, _ = os.Getwd()  // Default to cwd
    }
    repoPath, _ = filepath.Abs(repoPath)

    // 3. Get state manager
    mgr, _ := state.NewManager()

    // 4. Add the note
    note, err := mgr.AddNote(
        repoPath,
        params.Branch,
        params.Commit,
        params.FilePath,
        params.LineNumber,
        params.Text,
        params.Author,
        noteType,
        params.Metadata,
    )

    // 5. Return result as NoteResult struct
    return &NoteResult{...}, nil
}
```

---

## Using MCP Tools

### Via CLI (cerebro-mcp)

```bash
# List all notes
cerebro-mcp list-notes

# Add a note
cerebro-mcp add-note \
  --author "claude" \
  --branch "main" \
  --commit "abc123" \
  --file-path "src/app.go" \
  --line-number 42 \
  --text "Consider adding validation here"

# Resolve a comment
cerebro-mcp resolve-comment --comment-id "123-0"
```

### Via mcporter (more reliable)

```bash
# List notes
npx mcporter call --stdio "~/commands/cerebro mcp" 'list_notes()'

# Add note with all params
npx mcporter call --stdio "~/commands/cerebro mcp" 'add_note(
  author: "claude",
  branch: "main",
  commit: "abc123",
  file_path: "src/app.go",
  line_number: 42,
  text: "Consider validation"
)'
```

---

## Why MCP Matters

```
Without MCP:
────────────
AI Agent → Custom integration code → Your tool

With MCP:
─────────
AI Agent → Standard MCP protocol → Any MCP-compatible tool

Benefits:
• AI agents can discover tools dynamically
• Standard interface = no custom integrations
• Tools are self-documenting (inputSchema)
• Multiple AI systems can use the same tools
```

---

## Logging

MCP logs go to stderr (stdout is reserved for JSON-RPC):

```go
log.SetOutput(os.Stderr)
log.SetPrefix("[cerebro-mcp] ")
```

So you can see debug output while the protocol works on stdout.

---

## Questions to Think About

1. Why use stdin/stdout instead of HTTP for MCP?
2. How does an AI agent discover what tools are available?
3. Why are tool results wrapped in `content: [{type: "text", text: "..."}]`?

---

## Next

Finally, learn about the frontend (React UI):

```bash
cat docs/learn/08-frontend.md
```
