import Foundation
import os.log

/// Result of a CLI installation operation
public struct CLIInstallResult: Sendable {
    public let success: Bool
    public let message: String
}

/// Handles installation of the Cerebro CLI to ~/.local/bin
public final class CLIInstaller: Sendable {
    private let logger = Logger(subsystem: "com.cerebro.app", category: "CLIInstaller")

    /// Target installation path (no sudo required)
    private let installDir: URL
    private let installPath: URL

    public init() {
        let home = FileManager.default.homeDirectoryForCurrentUser
        self.installDir = home.appendingPathComponent(".local/bin")
        self.installPath = installDir.appendingPathComponent("cerebro")
    }

    /// Check if CLI is installed and its current status
    public func checkStatus() -> InstallationStatus {
        let fm = FileManager.default

        // Check if file exists
        guard fm.fileExists(atPath: installPath.path) else {
            return .notInstalled
        }

        // Check if it's a symlink pointing to our bundle
        if let bundledPath = findBundledExecutable() {
            do {
                let destination = try fm.destinationOfSymbolicLink(atPath: installPath.path)
                let resolvedDest = URL(fileURLWithPath: destination, relativeTo: installPath.deletingLastPathComponent()).standardized

                if resolvedDest.path == bundledPath.path {
                    return .installed
                } else {
                    return .differentVersion(path: destination)
                }
            } catch {
                // Not a symlink, could be a standalone binary
                return .differentVersion(path: installPath.path)
            }
        }

        return .installed
    }

    /// Install the CLI by creating a symlink
    public func install() -> CLIInstallResult {
        let fm = FileManager.default

        // Find bundled executable
        guard let bundledPath = findBundledExecutable() else {
            return CLIInstallResult(
                success: false,
                message: "Could not find the Cerebro executable in the app bundle. Please reinstall the application."
            )
        }

        let destPath = self.installPath.path
        logger.info("Installing CLI from: \(bundledPath.path) to \(destPath)")

        // Create ~/.local/bin if needed
        let installDirPath = self.installDir.path
        if !fm.fileExists(atPath: installDirPath) {
            do {
                try fm.createDirectory(at: installDir, withIntermediateDirectories: true)
                logger.info("Created directory: \(installDirPath)")
            } catch {
                return CLIInstallResult(
                    success: false,
                    message: "Failed to create directory ~/.local/bin: \(error.localizedDescription)"
                )
            }
        }

        // Remove existing file/symlink if present
        if fm.fileExists(atPath: destPath) {
            do {
                try fm.removeItem(at: installPath)
                logger.info("Removed existing file at: \(destPath)")
            } catch {
                return CLIInstallResult(
                    success: false,
                    message: "Failed to remove existing CLI: \(error.localizedDescription)"
                )
            }
        }

        // Create symlink
        do {
            try fm.createSymbolicLink(at: installPath, withDestinationURL: bundledPath)
            logger.info("Created symlink: \(destPath) -> \(bundledPath.path)")
        } catch {
            return CLIInstallResult(
                success: false,
                message: "Failed to create symlink: \(error.localizedDescription)"
            )
        }

        // Set executable permissions
        do {
            try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: installPath.path)
        } catch {
            logger.warning("Could not set permissions: \(error.localizedDescription)")
        }

        // Check if ~/.local/bin is in PATH
        let pathMessage = checkPathConfiguration()

        return CLIInstallResult(
            success: true,
            message: "CLI installed successfully at ~/.local/bin/cerebro\n\n\(pathMessage)"
        )
    }

    /// Uninstall the CLI
    public func uninstall() -> CLIInstallResult {
        let fm = FileManager.default

        guard fm.fileExists(atPath: installPath.path) else {
            return CLIInstallResult(
                success: false,
                message: "CLI is not installed at ~/.local/bin/cerebro"
            )
        }

        let pathToRemove = self.installPath.path
        do {
            try fm.removeItem(at: installPath)
            logger.info("Removed CLI at: \(pathToRemove)")
            return CLIInstallResult(success: true, message: "CLI uninstalled successfully")
        } catch {
            return CLIInstallResult(
                success: false,
                message: "Failed to uninstall CLI: \(error.localizedDescription)"
            )
        }
    }

    // MARK: - Private

    private func findBundledExecutable() -> URL? {
        // Check bundle resources
        if let bundleURL = Bundle.main.url(forResource: "cerebro", withExtension: nil) {
            if FileManager.default.isExecutableFile(atPath: bundleURL.path) {
                return bundleURL
            }
        }

        // Development: check relative paths
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

        return nil
    }

    private func checkPathConfiguration() -> String {
        // Get current PATH
        guard let path = ProcessInfo.processInfo.environment["PATH"] else {
            return "Add ~/.local/bin to your PATH to use the cerebro command."
        }

        let localBinPath = installDir.path
        let expandedLocalBin = (localBinPath as NSString).expandingTildeInPath

        if path.contains(expandedLocalBin) || path.contains("$HOME/.local/bin") || path.contains("~/.local/bin") {
            return "You can now use 'cerebro' from the terminal."
        } else {
            return """
            To use the cerebro command, add this to your shell profile (~/.zshrc or ~/.bashrc):

            export PATH="$HOME/.local/bin:$PATH"

            Then restart your terminal or run: source ~/.zshrc
            """
        }
    }
}

/// Status of CLI installation
public enum InstallationStatus: Sendable {
    case notInstalled
    case installed
    case differentVersion(path: String)
}
