import Cocoa
import Combine
import os.log

/// Manages the menu bar status item and menu
@MainActor
public final class MenuManager: Sendable {
    private let logger = Logger(subsystem: "com.cerebro.app", category: "MenuManager")
    private var statusItem: NSStatusItem?
    private let serverManager: ServerManager
    private var cancellables = Set<AnyCancellable>()

    private let onOpenWindow: () -> Void
    private let onInstallCLI: () -> Void
    private let onQuit: () -> Void

    public init(
        serverManager: ServerManager,
        onOpenWindow: @escaping () -> Void,
        onInstallCLI: @escaping () -> Void,
        onQuit: @escaping () -> Void
    ) {
        self.serverManager = serverManager
        self.onOpenWindow = onOpenWindow
        self.onInstallCLI = onInstallCLI
        self.onQuit = onQuit

        setupStatusItem()
        observeServerHealth()
    }

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)

        if let button = statusItem?.button {
            // Use SF Symbol for the icon
            let image = NSImage(systemSymbolName: "brain.head.profile", accessibilityDescription: "Cerebro")
            image?.isTemplate = true
            button.image = image
            button.toolTip = "Cerebro"
        }

        statusItem?.menu = buildMenu()
    }

    private func buildMenu() -> NSMenu {
        let menu = NSMenu()

        // Open Cerebro
        let openItem = NSMenuItem(title: "Open Cerebro", action: #selector(openWindowClicked(_:)), keyEquivalent: "o")
        openItem.target = self
        menu.addItem(openItem)

        menu.addItem(NSMenuItem.separator())

        // Server status
        let statusItem = NSMenuItem(title: "Server: Starting...", action: nil, keyEquivalent: "")
        statusItem.tag = 100  // Tag for updating later
        menu.addItem(statusItem)

        menu.addItem(NSMenuItem.separator())

        // Install CLI
        let installItem = NSMenuItem(title: "Install CLI...", action: #selector(installCLIClicked(_:)), keyEquivalent: "")
        installItem.target = self
        menu.addItem(installItem)

        menu.addItem(NSMenuItem.separator())

        // Quit
        let quitItem = NSMenuItem(title: "Quit Cerebro", action: #selector(quitClicked(_:)), keyEquivalent: "q")
        quitItem.target = self
        menu.addItem(quitItem)

        return menu
    }

    private func observeServerHealth() {
        serverManager.$isServerHealthy
            .receive(on: DispatchQueue.main)
            .sink { [weak self] isHealthy in
                self?.updateServerStatus(isHealthy: isHealthy)
            }
            .store(in: &cancellables)
    }

    private func updateServerStatus(isHealthy: Bool) {
        guard let menu = statusItem?.menu,
              let statusItem = menu.item(withTag: 100) else { return }

        if isHealthy {
            statusItem.title = "Server: Running"
            statusItem.image = NSImage(systemSymbolName: "checkmark.circle.fill", accessibilityDescription: "Running")
            statusItem.image?.isTemplate = true
        } else {
            statusItem.title = "Server: Not responding"
            statusItem.image = NSImage(systemSymbolName: "exclamationmark.circle", accessibilityDescription: "Not running")
            statusItem.image?.isTemplate = true
        }

        // Update tooltip
        self.statusItem?.button?.toolTip = isHealthy ? "Cerebro - Running" : "Cerebro - Server not responding"
    }

    // MARK: - Actions

    @objc private func openWindowClicked(_ sender: Any) {
        onOpenWindow()
    }

    @objc private func installCLIClicked(_ sender: Any) {
        onInstallCLI()
    }

    @objc private func quitClicked(_ sender: Any) {
        onQuit()
    }
}
