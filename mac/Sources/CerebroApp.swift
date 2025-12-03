import AppKit
import CerebroKit
import os.log

// Debug logger that writes to file
func debugLog(_ message: String) {
    let logger = Logger(subsystem: "com.cerebro.app", category: "Debug")
    logger.info("\(message)")
    NSLog("Cerebro: \(message)")

    // Also write to a file for debugging
    let logPath = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("cerebro-debug.log")
    let timestamp = ISO8601DateFormatter().string(from: Date())
    let logLine = "[\(timestamp)] \(message)\n"
    if let data = logLine.data(using: .utf8) {
        if FileManager.default.fileExists(atPath: logPath.path) {
            if let handle = try? FileHandle(forWritingTo: logPath) {
                handle.seekToEndOfFile()
                handle.write(data)
                handle.closeFile()
            }
        } else {
            try? data.write(to: logPath)
        }
    }
}

// Pure AppKit entry point - no SwiftUI
@main
struct CerebroApp {
    static func main() {
        debugLog("Cerebro starting...")
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        debugLog("Running app...")
        app.run()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private var mainWindow: NSWindow?
    private var webViewController: WebViewController?
    private var serverManager: ServerManager?
    private var menuManager: MenuManager?

    func applicationDidFinishLaunching(_ notification: Notification) {
        debugLog("applicationDidFinishLaunching called")

        // Set app icon from icns file
        if let iconPath = Bundle.main.path(forResource: "Cerebro", ofType: "icns"),
           let icon = NSImage(contentsOfFile: iconPath) {
            NSApp.applicationIconImage = icon
            debugLog("Loaded icon from bundle: \(iconPath)")
        } else {
            // Try loading from icon directory (development)
            let devIconPath = URL(fileURLWithPath: Bundle.main.bundlePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("icon/Cerebro.icns")
            if let icon = NSImage(contentsOfFile: devIconPath.path) {
                NSApp.applicationIconImage = icon
                debugLog("Loaded icon from dev path: \(devIconPath.path)")
            } else {
                debugLog("Could not load icon from: \(devIconPath.path)")
            }
        }

        // Start as regular app (will show in dock), switch to accessory when window closes
        // This ensures the window can be shown properly on first launch
        debugLog("Setting activation policy to regular...")
        NSApp.setActivationPolicy(.regular)

        // Build standard menus (App/Edit/Window) for copy/paste and Quit
        setupMainMenu()


        // Initialize server manager
        serverManager = ServerManager()
        debugLog("ServerManager initialized")

        // Initialize menu bar
        menuManager = MenuManager(
            serverManager: serverManager!,
            onOpenWindow: { [weak self] in
                debugLog("onOpenWindow callback triggered")
                self?.showMainWindow()
            },
            onInstallCLI: { [weak self] in self?.installCLI() },
            onQuit: { NSApp.terminate(nil) }
        )
        debugLog("MenuManager initialized")

        // Start the server
        serverManager?.startServer()
        debugLog("Server start requested")

        // Show main window after short delay for server to start
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            debugLog("Delayed showMainWindow called")
            self?.showMainWindow()
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        serverManager?.stopServer()
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showMainWindow()
        return true
    }

    private func showMainWindow() {
        debugLog("showMainWindow() called")

        // Must switch to regular app BEFORE creating/showing window
        debugLog("Setting activation policy to regular...")
        NSApp.setActivationPolicy(.regular)

        if mainWindow == nil {
            debugLog("Creating new window...")
            let port = serverManager?.port ?? 3030
            debugLog("Using port: \(port)")

            // Create window first, then set content view controller
            mainWindow = NSWindow(
                contentRect: NSRect(x: 100, y: 100, width: 1200, height: 800),
                styleMask: [.titled, .closable, .miniaturizable, .resizable],
                backing: .buffered,
                defer: false
            )
            mainWindow?.title = "Cerebro"

            // Use WebViewController
            webViewController = WebViewController(port: port)
            mainWindow?.contentViewController = webViewController

            // IMPORTANT: Set content size AFTER setting contentViewController
            // because contentViewController can collapse the window to its view's size
            mainWindow?.setContentSize(NSSize(width: 1200, height: 800))

            mainWindow?.isReleasedWhenClosed = false
            mainWindow?.delegate = self
            mainWindow?.backgroundColor = .windowBackgroundColor

            // Set minimum size
            mainWindow?.minSize = NSSize(width: 800, height: 600)

            // Center on main screen
            mainWindow?.center()

            debugLog("Window created: \(String(describing: mainWindow))")
            debugLog("Window frame: \(mainWindow?.frame ?? .zero)")
            debugLog("Content view: \(String(describing: mainWindow?.contentView))")
        }

        debugLog("Making window key and ordering front...")
        mainWindow?.makeKeyAndOrderFront(nil)
        mainWindow?.orderFrontRegardless()
        debugLog("Activating app...")
        NSApp.activate(ignoringOtherApps: true)

        // Force window to be visible
        if let window = mainWindow {
            window.level = .floating
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                window.level = .normal
            }
        }
        debugLog("showMainWindow() complete, window visible: \(mainWindow?.isVisible ?? false)")
    }

    private func installCLI() {
        let installer = CLIInstaller()
        let result = installer.install()

        let alert = NSAlert()
        alert.alertStyle = result.success ? .informational : .warning
        alert.messageText = result.success ? "CLI Installed" : "Installation Failed"
        alert.informativeText = result.message
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }
}

// MARK: - NSWindowDelegate
extension AppDelegate: NSWindowDelegate {
    func windowWillClose(_ notification: Notification) {
        // Switch back to accessory mode when window closes (hides from dock)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            NSApp.setActivationPolicy(.accessory)
        }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        // Hide window instead of closing it completely
        sender.orderOut(nil)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            NSApp.setActivationPolicy(.accessory)
        }
        return false
    }
}

// MARK: - Menu setup
private extension AppDelegate {
    func setupMainMenu() {
        let mainMenu = NSMenu()

        // App menu
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu()
        let appName = "Cerebro"

        appMenu.addItem(withTitle: "About \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide \(appName)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.option, .command]
        appMenu.addItem(hideOthers)
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // Edit menu
        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = NSMenuItem(title: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        redo.keyEquivalentModifierMask = [.shift, .command]
        editMenu.addItem(redo)
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        let pastePlain = NSMenuItem(title: "Paste and Match Style", action: #selector(NSTextView.pasteAsPlainText(_:)), keyEquivalent: "V")
        pastePlain.keyEquivalentModifierMask = [.shift, .command]
        editMenu.addItem(pastePlain)
        // Use deleteBackward so the Backspace key works in text fields
        editMenu.addItem(withTitle: "Delete", action: #selector(NSResponder.deleteBackward(_:)), keyEquivalent: "\u{8}")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSResponder.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        // Window menu
        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "Window")
        windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        windowMenu.addItem(NSMenuItem.separator())
        windowMenu.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        NSApp.mainMenu = mainMenu
    }
}
