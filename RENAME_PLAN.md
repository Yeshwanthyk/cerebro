# Cerebro Rename Plan 🧠

Renaming `guck` → `cerebro` across the entire codebase.

## Phase 1: Core Go Module & Imports ✅
- [x] Update `go.mod` module name: `github.com/tuist/guck` → `github.com/Yeshwanthyk/cerebro`
- [x] Update all import statements in Go files (9 files)
  - [x] main.go
  - [x] internal/server/server.go
  - [x] internal/mcp/mcp_test.go
  - [x] internal/mcp/mcp.go
  - [x] internal/cli/formatters/formatters.go
  - [x] internal/cli/formatters/formatters_test.go
  - [x] internal/cli/commands/notes.go
  - [x] internal/cli/commands/comments.go

## Phase 2: CLI & Binary Names ✅
- [x] Update app name in main.go: `"guck"` → `"cerebro"`
- [x] Update shell integration variable names:
  - [x] `_GUCK_CURRENT_REPO` → `_CEREBRO_CURRENT_REPO`
  - [x] `_guck_get_repo_path()` → `_cerebro_get_repo_path()`
  - [x] `_guck_auto_manage()` → `_cerebro_auto_manage()`
  - [x] `_guck_original_cd` → `_cerebro_original_cd`
  - [x] `GUCK_DAEMON` → `CEREBRO_DAEMON`
- [x] Update command references in messages:
  - [x] "guck daemon start" → "cerebro daemon start"
  - [x] "guck config" → "cerebro config"
  - [x] All other CLI help text

## Phase 3: State & Config Directories ✅
- [x] Update state directory: `~/.local/state/guck/` → `~/.local/state/cerebro/`
- [x] Update config directory: `~/.config/guck/` → `~/.config/cerebro/`
- [x] Update data directory: `~/.local/share/guck/` → `~/.local/share/cerebro/`
- [x] Files to update:
  - [x] internal/state/state.go (3 occurrences)
  - [x] internal/daemon/daemon.go (3 occurrences)
  - [x] internal/config/config.go (1 occurrence)

## Phase 4: MCP Integration ✅
- [x] Update MCP CLI tool name: `guck-mcp` → `cerebro-mcp`
- [x] Update MCP server name: `"guck"` → `"cerebro"`
- [x] Update log prefix: `[guck-mcp]` → `[cerebro-mcp]`
- [x] Files to update:
  - [x] internal/mcp/server.go
- [x] Update installation paths in AGENTS.md:
  - [x] `~/commands/guck` → `~/commands/cerebro`
  - [x] `~/commands/guck-mcp` → `~/commands/cerebro-mcp`

## Phase 5: Frontend ✅
- [x] Update page title: "Guck" → "Cerebro" (2 files)
- [x] Update localStorage keys: `'guck-theme'` → `'cerebro-theme'`
- [x] Files to update:
  - [x] static/index.html
  - [x] internal/server/static/index.html

## Phase 6: Documentation ✅
- [x] Update README.md
  - [x] Title and description
  - [x] Installation instructions
  - [x] Command examples
  - [x] MCP configuration
- [x] Update AGENTS.md
  - [x] All references to guck/guck-mcp
  - [x] Command examples
  - [x] File paths
- [x] Update docs/README.md
  - [x] Full documentation overhaul
- [x] Update CHANGELOG.md
  - [x] Project name references
- [x] Update cliff.toml
  - [x] Configuration header

## Phase 7: Generate MCP CLI with mcporter ✅
- [x] Build cerebro binary
- [x] Copy to ~/commands/cerebro
- [x] Generate cerebro-mcp CLI using mcporter:
  ```bash
  npx mcporter generate-cli \
    --command "$HOME/commands/cerebro mcp" \
    --name cerebro-mcp \
    --description "Cerebro code review MCP tools" \
    --compile $HOME/commands/cerebro-mcp
  ```
- [x] Test cerebro-mcp commands

## Phase 8: Testing & Verification ✅
- [x] Run `go build -o cerebro .`
- [x] Test basic commands:
  - [x] `cerebro --help`
  - [x] `cerebro init` (shell integration)
  - [x] `cerebro config show`
- [x] Test MCP integration:
  - [x] `cerebro-mcp --help`
  - [x] `cerebro-mcp list-comments`
- [x] Run existing tests: `go test ./...` (1 pre-existing failure unrelated to rename)

## Phase 9: Git & Cleanup
- [ ] Commit changes
- [ ] Push to new origin (github.com/Yeshwanthyk/cerebro)
- [ ] Update any CI/CD references
- [ ] Archive old documentation if needed

---

**Progress Legend:**
- [ ] Todo
- [x] Done
- [~] In Progress
