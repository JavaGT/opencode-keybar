import SwiftUI
import AppKit

@main
struct OpencodeKeybarApp: App {
    @StateObject private var store: KeyStore
    @StateObject private var settingsBox: SettingsBox
    @Environment(\.openSettings) private var openSettings
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    init() {
        let s = AppSettings.load()
        let store = KeyStore(settings: s)
        _store = StateObject(wrappedValue: store)
        _settingsBox = StateObject(wrappedValue: SettingsBox(settings: s))
        store.start()
        store.startAutoRefresh(seconds: s.autoRefreshSeconds)
    }

    var body: some Scene {
        MenuBarExtra {
            MenuView(store: store, settingsBox: settingsBox, openSettingsAction: {
                NSApp.activate(ignoringOtherApps: true)
                openSettings()
            })
        } label: {
            Label("opencode keys", systemImage: store.providers.contains { $0.hasKey } ? "key.fill" : "key.slash")
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView(settingsBox: settingsBox) { newSettings in
                newSettings.save()
                store.startAutoRefresh(seconds: newSettings.autoRefreshSeconds)
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory) // no dock icon — menu bar only
    }
}

/// Wraps AppSettings so SettingsView can bind to it while still saving.
final class SettingsBox: ObservableObject {
    @Published var settings: AppSettings
    init(settings: AppSettings) { self.settings = settings }
}
