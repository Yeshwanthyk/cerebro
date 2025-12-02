// swift-tools-version:6.0
import PackageDescription

let package = Package(
    name: "Cerebro",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "Cerebro", targets: ["Cerebro"])
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "Cerebro",
            dependencies: ["CerebroKit"],
            path: "Sources",
            exclude: ["CerebroKit"],
            sources: ["CerebroApp.swift"],
            resources: [
                .copy("../icon/Cerebro.icns")
            ]
        ),
        .target(
            name: "CerebroKit",
            path: "Sources/CerebroKit",
            swiftSettings: [
                .enableExperimentalFeature("StrictConcurrency")
            ]
        )
    ],
    swiftLanguageModes: [.v6]
)
