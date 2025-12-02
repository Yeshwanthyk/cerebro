import Foundation
import Combine
import os.log

// File-based debug logging helper
func smDebugLog(_ message: String) {
    let logPath = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("cerebro-debug.log")
    let timestamp = ISO8601DateFormatter().string(from: Date())
    let logLine = "[SM \(timestamp)] \(message)\n"
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

/// Manages the Cerebro server process lifecycle
@MainActor
public final class ServerManager: ObservableObject, Sendable {
    private let logger = Logger(subsystem: "com.cerebro.app", category: "ServerManager")
    private var serverProcess: Process?
    private var healthCheckTimer: Timer?
    private var restartCount = 0
    private let maxRestarts = 3

    @Published public private(set) var isServerRunning = false
    @Published public private(set) var isServerHealthy = false
    @Published public private(set) var serverOutput: String = ""

    public let port: Int

    public init(port: Int = 3030) {
        self.port = port
    }

    // Note: Don't use deinit for cleanup in Swift 6 with @MainActor
    // The AppDelegate should call stopServer() explicitly before releasing

    // MARK: - Server Lifecycle

    public func startServer() {
        smDebugLog("startServer() called")
        guard serverProcess == nil else {
            smDebugLog("Server already running")
            logger.info("Server already running")
            return
        }

        guard let executableURL = findExecutable() else {
            smDebugLog("Could not find cerebro executable")
            logger.error("Could not find cerebro executable - will check for external server")
            // Still start health checking in case an external server is running (dev mode)
            startHealthCheck()
            return
        }

        smDebugLog("Starting server from: \(executableURL.path)")
        logger.info("Starting server from: \(executableURL.path)")

        let process = Process()
        process.executableURL = executableURL

        // Find the first git repo in common locations to use as initial repo
        // The server requires a git repo to start, but user can switch repos later
        let initialRepoPath = findInitialGitRepo()
        smDebugLog("Using initial repo path: \(initialRepoPath ?? "none")")

        if let repoPath = initialRepoPath {
            process.arguments = ["start", repoPath, "--port", String(port)]
            process.currentDirectoryURL = URL(fileURLWithPath: repoPath)
        } else {
            // No git repo found, try without path (will fail, but let it try)
            process.arguments = ["start", "--port", String(port)]
            process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
        }

        // Setup environment
        var environment = ProcessInfo.processInfo.environment
        environment["HOME"] = FileManager.default.homeDirectoryForCurrentUser.path
        process.environment = environment

        // Capture output
        let outputPipe = Pipe()
        let errorPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = errorPipe

        outputPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                DispatchQueue.main.async {
                    self?.serverOutput += output
                    self?.logger.info("Server: \(output)")
                }
            }
        }

        errorPipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                DispatchQueue.main.async {
                    self?.serverOutput += output
                    self?.logger.error("Server error: \(output)")
                }
            }
        }

        // Handle termination
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.async {
                self?.handleTermination(exitCode: process.terminationStatus)
            }
        }

        do {
            try process.run()
            serverProcess = process
            isServerRunning = true
            startHealthCheck()
            smDebugLog("Server started with PID: \(process.processIdentifier)")
            logger.info("Server started with PID: \(process.processIdentifier)")
        } catch {
            smDebugLog("Failed to start server: \(error.localizedDescription)")
            logger.error("Failed to start server: \(error.localizedDescription)")
        }
    }

    public func stopServer() {
        healthCheckTimer?.invalidate()
        healthCheckTimer = nil

        guard let process = serverProcess, process.isRunning else {
            serverProcess = nil
            isServerRunning = false
            isServerHealthy = false
            return
        }

        logger.info("Stopping server...")

        // Graceful shutdown: SIGTERM -> wait -> SIGKILL
        process.terminate()

        DispatchQueue.global().asyncAfter(deadline: .now() + 2.0) { [weak self] in
            if process.isRunning {
                self?.logger.warning("Server didn't respond to SIGTERM, sending SIGKILL")
                kill(process.processIdentifier, SIGKILL)
            }
        }

        serverProcess = nil
        isServerRunning = false
        isServerHealthy = false
    }

    public func restartServer() {
        stopServer()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.startServer()
        }
    }

    // MARK: - Executable Discovery

    /// Finds a git repository in common locations to use as initial startup repo
    private func findInitialGitRepo() -> String? {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser

        // Check common development directories
        let searchPaths = [
            home.appendingPathComponent("Code"),
            home.appendingPathComponent("Developer"),
            home.appendingPathComponent("Projects"),
            home.appendingPathComponent("dev"),
            home.appendingPathComponent("repos"),
            home.appendingPathComponent("git"),
            home.appendingPathComponent("src"),
            home.appendingPathComponent("Documents/Code"),
            home.appendingPathComponent("Documents/Developer"),
            home.appendingPathComponent("Documents/Projects"),
        ]

        for searchPath in searchPaths {
            if let repo = findFirstGitRepoIn(searchPath) {
                return repo
            }
        }

        // Check home directory itself (unlikely but possible)
        if fm.fileExists(atPath: home.appendingPathComponent(".git").path) {
            return home.path
        }

        return nil
    }

    /// Recursively finds the first git repository in a directory (max depth 2)
    private func findFirstGitRepoIn(_ directory: URL, depth: Int = 0) -> String? {
        let fm = FileManager.default

        // Check if this directory is a git repo
        let gitDir = directory.appendingPathComponent(".git")
        if fm.fileExists(atPath: gitDir.path) {
            return directory.path
        }

        // Don't go too deep
        guard depth < 2 else { return nil }

        // Check subdirectories
        guard let contents = try? fm.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles]) else {
            return nil
        }

        for item in contents {
            var isDir: ObjCBool = false
            if fm.fileExists(atPath: item.path, isDirectory: &isDir), isDir.boolValue {
                if let repo = findFirstGitRepoIn(item, depth: depth + 1) {
                    return repo
                }
            }
        }

        return nil
    }

    private func findExecutable() -> URL? {
        smDebugLog("findExecutable() called, bundlePath: \(Bundle.main.bundlePath)")

        // 1. Check bundle resources
        if let bundleURL = Bundle.main.url(forResource: "cerebro", withExtension: nil) {
            smDebugLog("Bundle URL found: \(bundleURL.path)")
            if FileManager.default.isExecutableFile(atPath: bundleURL.path) {
                smDebugLog("Bundle executable is valid")
                return bundleURL
            } else {
                smDebugLog("Bundle path exists but not executable")
            }
        } else {
            smDebugLog("Bundle.main.url(forResource: cerebro) returned nil")

            // Try direct path to Resources
            let resourcesPath = URL(fileURLWithPath: Bundle.main.bundlePath)
                .appendingPathComponent("Contents/Resources/cerebro")
            smDebugLog("Trying direct path: \(resourcesPath.path)")
            if FileManager.default.isExecutableFile(atPath: resourcesPath.path) {
                smDebugLog("Direct path is executable")
                return resourcesPath
            } else {
                smDebugLog("Direct path not executable, exists: \(FileManager.default.fileExists(atPath: resourcesPath.path))")
            }
        }

        // 2. Check relative to bundle (development)
        let bundlePath = Bundle.main.bundlePath
        let devPaths = [
            URL(fileURLWithPath: bundlePath).deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("dist-exe/cerebro"),
            URL(fileURLWithPath: bundlePath).deletingLastPathComponent()
                .appendingPathComponent("dist-exe/cerebro")
        ]

        for path in devPaths {
            smDebugLog("Checking dev path: \(path.path)")
            if FileManager.default.isExecutableFile(atPath: path.path) {
                smDebugLog("Found executable at dev path")
                return path
            }
        }

        // 3. Check ~/.local/bin
        let localBin = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".local/bin/cerebro")
        smDebugLog("Checking local bin: \(localBin.path)")
        if FileManager.default.isExecutableFile(atPath: localBin.path) {
            smDebugLog("Found executable at local bin")
            return localBin
        }

        // 4. Check PATH using which
        let whichProcess = Process()
        whichProcess.executableURL = URL(fileURLWithPath: "/usr/bin/which")
        whichProcess.arguments = ["cerebro"]

        let pipe = Pipe()
        whichProcess.standardOutput = pipe

        do {
            try whichProcess.run()
            whichProcess.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let path = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
               !path.isEmpty {
                smDebugLog("Found via which: \(path)")
                return URL(fileURLWithPath: path)
            }
        } catch {
            smDebugLog("which cerebro failed: \(error.localizedDescription)")
            logger.error("which cerebro failed: \(error.localizedDescription)")
        }

        smDebugLog("No executable found!")
        return nil
    }

    // MARK: - Health Check

    private func startHealthCheck() {
        healthCheckTimer?.invalidate()
        healthCheckTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.checkHealth()
            }
        }
        // Initial check
        checkHealth()
    }

    private func checkHealth() {
        guard let url = URL(string: "http://localhost:\(port)/api/health") else {
            logger.error("Invalid health check URL")
            return
        }

        var request = URLRequest(url: url)
        request.timeoutInterval = 2.0

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                if let error = error {
                    self?.logger.error("Health check failed: \(error.localizedDescription)")
                    self?.isServerHealthy = false
                    return
                }

                if let httpResponse = response as? HTTPURLResponse {
                    if httpResponse.statusCode == 200 {
                        self?.isServerHealthy = true
                        self?.restartCount = 0
                    } else {
                        self?.logger.warning("Health check returned status: \(httpResponse.statusCode)")
                        self?.isServerHealthy = false
                    }
                } else {
                    self?.logger.warning("Health check: no HTTP response")
                    self?.isServerHealthy = false
                }
            }
        }.resume()
    }

    // MARK: - Termination Handling

    private func handleTermination(exitCode: Int32) {
        smDebugLog("handleTermination called with exitCode: \(exitCode), serverOutput: \(serverOutput)")
        logger.warning("Server terminated with exit code: \(exitCode)")
        isServerRunning = false
        isServerHealthy = false
        serverProcess = nil

        // Auto-restart if unexpected termination
        if exitCode != 0 && restartCount < maxRestarts {
            restartCount += 1
            let attempt = restartCount
            let maxAttempts = maxRestarts
            smDebugLog("Auto-restarting server (attempt \(attempt)/\(maxAttempts))")
            logger.info("Auto-restarting server (attempt \(attempt)/\(maxAttempts))")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.startServer()
            }
        } else if exitCode != 0 {
            smDebugLog("Max restarts reached, giving up")
        }
    }
}
