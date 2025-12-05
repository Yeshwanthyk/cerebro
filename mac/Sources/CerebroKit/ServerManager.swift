import Foundation
import Combine
import os.log

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
        guard serverProcess == nil else {
            logger.info("Server already running")
            return
        }

        guard let executableURL = findExecutable() else {
            logger.error("Could not find cerebro executable - will check for external server")
            // Still start health checking in case an external server is running (dev mode)
            startHealthCheck()
            return
        }

        logger.info("Starting server from: \(executableURL.path)")

        let process = Process()
        process.executableURL = executableURL

        // Start server without a specific repo - the web UI has a repo picker
        process.arguments = ["start", "--port", String(port)]
        process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser

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
            logger.info("Server started with PID: \(process.processIdentifier)")
        } catch {
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

    private func findExecutable() -> URL? {
        // 1. Check bundle resources
        if let bundleURL = Bundle.main.url(forResource: "cerebro", withExtension: nil) {
            if FileManager.default.isExecutableFile(atPath: bundleURL.path) {
                return bundleURL
            }
        } else {
            // Try direct path to Resources
            let resourcesPath = URL(fileURLWithPath: Bundle.main.bundlePath)
                .appendingPathComponent("Contents/Resources/cerebro")
            if FileManager.default.isExecutableFile(atPath: resourcesPath.path) {
                return resourcesPath
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
            if FileManager.default.isExecutableFile(atPath: path.path) {
                return path
            }
        }

        // 3. Check ~/.local/bin
        let localBin = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".local/bin/cerebro")
        if FileManager.default.isExecutableFile(atPath: localBin.path) {
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
                return URL(fileURLWithPath: path)
            }
        } catch {
            logger.error("which cerebro failed: \(error.localizedDescription)")
        }

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
        logger.warning("Server terminated with exit code: \(exitCode)")
        isServerRunning = false
        isServerHealthy = false
        serverProcess = nil

        // Auto-restart if unexpected termination
        if exitCode != 0 && restartCount < maxRestarts {
            restartCount += 1
            let attempt = restartCount
            let maxAttempts = maxRestarts
            logger.info("Auto-restarting server (attempt \(attempt)/\(maxAttempts))")
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                self?.startServer()
            }
        }
    }
}
