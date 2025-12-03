import Cocoa
import WebKit
@preconcurrency import UserNotifications
import os.log

/// View controller that hosts the Cerebro web UI in a WKWebView
@MainActor
public final class WebViewController: NSViewController, WKNavigationDelegate, WKScriptMessageHandler {
    private let logger = Logger(subsystem: "com.cerebro.app", category: "WebViewController")
    private var webView: WKWebView!
    private let port: Int
    private var loadingIndicator: NSProgressIndicator?
    private var errorView: NSView?

    public init(port: Int) {
        self.port = port
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    public override func loadView() {
        logger.info("loadView() called")

        // Configure WebView
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")

        // Setup JavaScript bridge
        let contentController = WKUserContentController()
        contentController.add(self, name: "cerebroBridge")

        // Inject bridge script + console/error forwarding
        let bridgeScript = """
        window.cerebroBridge = {
            postMessage: function(message) {
                window.webkit.messageHandlers.cerebroBridge.postMessage(message);
            },
            openInFinder: function(path) {
                this.postMessage({type: 'openInFinder', path: path});
            },
            openTerminal: function(path) {
                this.postMessage({type: 'openTerminal', path: path});
            },
            showNotification: function(title, body) {
                this.postMessage({type: 'notification', title: title, body: body});
            },
            log: function(level, message) {
                this.postMessage({type: 'console', level: level, message: message});
            }
        };
        (function() {
            const send = (level, parts) => {
                try {
                    window.cerebroBridge.log(level, parts.map(String).join(' '));
                } catch (_) {}
            };
            const wrap = (method) => {
                const original = console[method];
                console[method] = function(...args) {
                    send(method, args);
                    if (original) original.apply(console, args);
                };
            };
            ['log', 'warn', 'error'].forEach(wrap);
            window.addEventListener('error', (e) => {
                send('error', [e.message, e.filename || '', e.lineno || '', e.error?.stack || '']);
            });
            window.addEventListener('unhandledrejection', (e) => {
                send('error', ['unhandledrejection', e.reason?.stack || e.reason || '']);
            });
        })();
        """
        let userScript = WKUserScript(source: bridgeScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        contentController.addUserScript(userScript)
        config.userContentController = contentController

        // Create WebView - use autoresizing mask so it fills window content area
        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1200, height: 800), configuration: config)
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = false
        webView.autoresizingMask = [.width, .height]

        // Allow inspecting in Safari dev tools
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }

        self.view = webView
        logger.info("loadView() complete, view set to webView, frame: \(NSStringFromRect(self.webView.frame))")
    }

    public override func viewDidLoad() {
        super.viewDidLoad()
        setupLoadingIndicator()
        loadWebUI()
    }

    // MARK: - Loading

    private func setupLoadingIndicator() {
        let indicator = NSProgressIndicator()
        indicator.style = .spinning
        indicator.controlSize = .regular
        indicator.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(indicator)

        NSLayoutConstraint.activate([
            indicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            indicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])

        indicator.startAnimation(nil)
        loadingIndicator = indicator
    }

    private func loadWebUI() {
        guard let url = URL(string: "http://localhost:\(port)") else {
            showError("Invalid URL")
            return
        }

        let request = URLRequest(url: url)
        webView.load(request)
        logger.info("Loading web UI from: \(url)")
    }

    public func reload() {
        hideError()
        loadingIndicator?.startAnimation(nil)
        loadingIndicator?.isHidden = false
        loadWebUI()
    }

    // MARK: - Error Handling

    private func showError(_ message: String) {
        loadingIndicator?.stopAnimation(nil)
        loadingIndicator?.isHidden = true

        if errorView != nil { return }

        let container = NSView()
        container.translatesAutoresizingMaskIntoConstraints = false
        container.wantsLayer = true
        container.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

        let stack = NSStackView()
        stack.orientation = .vertical
        stack.spacing = 16
        stack.translatesAutoresizingMaskIntoConstraints = false

        let icon = NSImageView()
        icon.image = NSImage(systemSymbolName: "exclamationmark.triangle", accessibilityDescription: "Error")
        icon.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 48, weight: .light)
        icon.contentTintColor = .secondaryLabelColor

        let titleLabel = NSTextField(labelWithString: "Connection Error")
        titleLabel.font = .systemFont(ofSize: 18, weight: .semibold)
        titleLabel.textColor = .labelColor

        let messageLabel = NSTextField(labelWithString: message)
        messageLabel.font = .systemFont(ofSize: 13)
        messageLabel.textColor = .secondaryLabelColor
        messageLabel.alignment = .center

        let retryButton = NSButton(title: "Retry", target: self, action: #selector(retryClicked))
        retryButton.bezelStyle = .rounded

        stack.addArrangedSubview(icon)
        stack.addArrangedSubview(titleLabel)
        stack.addArrangedSubview(messageLabel)
        stack.addArrangedSubview(retryButton)

        container.addSubview(stack)
        view.addSubview(container)

        NSLayoutConstraint.activate([
            container.topAnchor.constraint(equalTo: view.topAnchor),
            container.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            container.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            container.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            stack.centerXAnchor.constraint(equalTo: container.centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: container.centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 300)
        ])

        errorView = container
    }

    private func hideError() {
        errorView?.removeFromSuperview()
        errorView = nil
    }

    @objc private func retryClicked() {
        reload()
    }

    // MARK: - WKNavigationDelegate

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadingIndicator?.stopAnimation(nil)
        loadingIndicator?.isHidden = true
        hideError()
        logger.info("Web UI loaded successfully")
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        logger.error("Navigation failed: \(error.localizedDescription)")
        showError("Failed to load: \(error.localizedDescription)")
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        logger.error("Provisional navigation failed: \(error.localizedDescription)")

        // Check if it's a connection refused error (server not ready)
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCannotConnectToHost {
            // Retry after a delay
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.loadWebUI()
            }
        } else {
            showError("Cannot connect to server. Is it running?")
        }
    }

    // MARK: - WKScriptMessageHandler

    public func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let type = body["type"] as? String else {
            return
        }

        switch type {
        case "openInFinder":
            if let path = body["path"] as? String {
                openInFinder(path: path)
            }
        case "openTerminal":
            if let path = body["path"] as? String {
                openTerminal(path: path)
            }
        case "notification":
            if let title = body["title"] as? String,
               let notificationBody = body["body"] as? String {
                showNotification(title: title, body: notificationBody)
            }
        case "console":
            if let level = body["level"] as? String,
               let message = body["message"] as? String {
                switch level {
                case "error":
                    logger.error("JS: \(message)")
                case "warn":
                    logger.warning("JS: \(message)")
                default:
                    logger.info("JS: \(message)")
                }
            }
        default:
            logger.warning("Unknown bridge message type: \(type)")
        }
    }

    // MARK: - Native Integrations

    private func openInFinder(path: String) {
        let expandedPath = NSString(string: path).expandingTildeInPath
        let url = URL(fileURLWithPath: expandedPath)

        if FileManager.default.fileExists(atPath: expandedPath) {
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } else {
            // Try to open parent directory
            let parent = url.deletingLastPathComponent()
            if FileManager.default.fileExists(atPath: parent.path) {
                NSWorkspace.shared.activateFileViewerSelecting([parent])
            }
        }
    }

    private func openTerminal(path: String) {
        let expandedPath = NSString(string: path).expandingTildeInPath

        // Try iTerm first, then Terminal
        let script = """
        tell application "System Events"
            if exists application process "iTerm2" then
                tell application "iTerm"
                    create window with default profile
                    tell current session of current window
                        write text "cd '\(expandedPath)'"
                    end tell
                end tell
            else
                tell application "Terminal"
                    do script "cd '\(expandedPath)'"
                    activate
                end tell
            end if
        end tell
        """

        var error: NSDictionary?
        if let scriptObject = NSAppleScript(source: script) {
            scriptObject.executeAndReturnError(&error)
            if let error = error {
                logger.error("AppleScript error: \(error)")
            }
        }
    }

    private func showNotification(title: String, body: String) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }

            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default

            let request = UNNotificationRequest(
                identifier: UUID().uuidString,
                content: content,
                trigger: nil
            )

            center.add(request)
        }
    }
}
