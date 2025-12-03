# Cerebro Mac App

Native macOS wrapper for Cerebro - a git diff review tool.

## Features

- Menu bar app (no dock icon)
- Embedded WebKit view for the React UI
- Manages the Cerebro server lifecycle
- CLI installer (no sudo required)
- Native macOS integrations:
  - Open in Finder
  - Open in Terminal (iTerm/Terminal.app)
  - Notifications

## Requirements

- macOS 12.0+
- Swift 5.9+
- Bun 1.3.2+ (for building the server)

## Building

### Development Build

Quick build for development:

```bash
make build-dev
make run
```

### Release Build

Full release build with app bundle:

```bash
make build
```

The app will be created at `release/Cerebro.app`.

### Signed Build

To create a signed build for distribution:

```bash
DEVELOPER_ID="Developer ID Application: Your Name (TEAMID)" make build
```

## Installing CLI

The app includes a "Install CLI..." menu option that creates a symlink at `~/.local/bin/cerebro` pointing to the bundled executable. No sudo required.

After installation, add to your shell profile if needed:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

## Architecture

```
mac/
├── Sources/
│   ├── CerebroApp.swift      # Main app entry, AppDelegate
│   ├── Assets.xcassets/      # App icons
│   └── CerebroKit/
│       ├── ServerManager.swift    # Server process lifecycle
│       ├── WebViewController.swift # WebKit integration + JS bridge
│       ├── MenuManager.swift      # Menu bar UI
│       └── CLIInstaller.swift     # CLI symlink installer
├── scripts/
│   ├── build.sh              # Release build script
│   └── build-dev.sh          # Development build script
├── Package.swift             # Swift Package manifest
├── Info.plist               # App manifest
├── Cerebro.entitlements     # App entitlements
└── Makefile                 # Build automation
```

## JavaScript Bridge

The web app can communicate with the native app via `window.cerebroBridge`:

```javascript
// Open a path in Finder
cerebroBridge.openInFinder('/path/to/folder');

// Open a path in Terminal
cerebroBridge.openTerminal('/path/to/repo');

// Show a notification
cerebroBridge.showNotification('Title', 'Body text');
```
