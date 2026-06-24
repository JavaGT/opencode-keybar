import Foundation

/// User-configured settings, persisted to ~/.config/opencode-keybar/settings.json
struct AppSettings: Codable, Equatable {
    var sshHost: String = ""          // e.g. user@server.example.com
    var sshPort: Int = 22
    var sshIdentityFile: String = ""  // optional path to private key
    var remotePort: Int = 47788       // daemon port on the server
    var localPort: Int = 47789        // local forwarded port (must not collide with a local daemon)
    var authToken: String = ""        // optional Bearer token
    var autoRefreshSeconds: Int = 30  // 0 = manual only
    var showAllProviders: Bool = false // hide providers with no key/profiles

    static let path: String = {
        let home = NSHomeDirectory()
        return "\(home)/.config/opencode-keybar/settings.json"
    }()

    static func load() -> AppSettings {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)) else { return AppSettings() }
        return (try? JSONDecoder().decode(AppSettings.self, from: data)) ?? AppSettings()
    }

    func save() {
        let dir = (Self.path as NSString).deletingLastPathComponent
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        if let data = try? JSONEncoder().encode(self) {
            try? data.write(to: URL(fileURLWithPath: Self.path), options: .atomic)
        }
    }
}
