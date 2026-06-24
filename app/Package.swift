// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "OpencodeKeybar",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "OpencodeKeybar",
            path: "Sources/OpencodeKeybar"
        )
    ]
)
