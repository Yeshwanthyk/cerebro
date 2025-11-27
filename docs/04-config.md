# 04 - Configuration (internal/config/)

## What This Package Does

Loads and saves user configuration from a TOML file.

This is a **simple** package - only ~70 lines of code!

---

## Visual: Config Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONFIG LOADING                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   config.Load()                                                 │
│        │                                                        │
│        ▼                                                        │
│   ┌─────────────────────┐                                      │
│   │ Get config path     │                                      │
│   │ ~/.config/cerebro/  │                                      │
│   │     config.toml     │                                      │
│   └──────────┬──────────┘                                      │
│              │                                                  │
│              ▼                                                  │
│   ┌─────────────────────┐     ┌──────────────────┐             │
│   │ File exists?        │─NO─►│ Return defaults  │             │
│   └──────────┬──────────┘     │ base: "main"     │             │
│              │ YES            │ mode: "branch"   │             │
│              ▼                └──────────────────┘             │
│   ┌─────────────────────┐                                      │
│   │ Parse TOML file     │                                      │
│   └──────────┬──────────┘                                      │
│              │                                                  │
│              ▼                                                  │
│   ┌─────────────────────┐     ┌──────────────────┐             │
│   │ Parse error?        │─YES►│ Return defaults  │             │
│   └──────────┬──────────┘     └──────────────────┘             │
│              │ NO                                               │
│              ▼                                                  │
│   ┌─────────────────────┐                                      │
│   │ Validate mode       │ ◄── Must be branch/working/staged    │
│   └──────────┬──────────┘                                      │
│              │                                                  │
│              ▼                                                  │
│        Return config                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Structure

```go
type Config struct {
    BaseBranch string `toml:"base_branch"`  // Branch to compare against
    Mode       string `toml:"mode"`         // "branch", "working", "staged"
}
```

---

## Config File Location

```
XDG_CONFIG_HOME is set?
        │
   YES  │  NO
        │
        ▼
$XDG_CONFIG_HOME/cerebro/config.toml
        │
        │ (else)
        ▼
~/.config/cerebro/config.toml
```

This follows the [XDG Base Directory Spec](https://specifications.freedesktop.org/basedir-spec/basedir-spec-latest.html).

---

## Example Config File

```toml
# ~/.config/cerebro/config.toml

base_branch = "main"
mode = "branch"
```

---

## Valid Modes

```go
var ValidModes = []string{"branch", "working", "staged"}
```

| Mode | Description |
|------|-------------|
| `branch` | Compare current branch vs base branch |
| `working` | Show all uncommitted changes |
| `staged` | Show only staged changes |

---

## Methods

```
┌────────────────────────────────────────────┐
│                 Config                      │
├────────────────────────────────────────────┤
│                                            │
│  Load() → (*Config, error)                 │
│      Load config from file or return       │
│      defaults if not found                 │
│                                            │
│  Save() → error                            │
│      Write config to file (creates         │
│      directories if needed)                │
│                                            │
│  IsValidMode(mode) → bool                  │
│      Check if mode is valid                │
│                                            │
└────────────────────────────────────────────┘
```

---

## CLI Integration

From `main.go`, the config commands work like this:

```bash
# Set base branch
cerebro config set base-branch master
# → Updates config.toml: base_branch = "master"

# Set mode
cerebro config set mode working
# → Updates config.toml: mode = "working"

# Show all settings
cerebro config show
# → base-branch = main
# → mode        = branch
```

---

## Defaults (Graceful Degradation)

The config system is designed to **never fail**:

1. No config file? → Use defaults
2. Parse error? → Use defaults  
3. Invalid mode? → Default to "branch"

This means Cerebro "just works" without any setup.

---

## Questions to Think About

1. Why use TOML instead of JSON or YAML?
2. What happens if someone manually edits the config with a typo?
3. Why follow XDG_CONFIG_HOME convention?

---

## Next

Learn about persistent state (comments, notes, viewed files):

```bash
cat docs/learn/05-state.md
```
