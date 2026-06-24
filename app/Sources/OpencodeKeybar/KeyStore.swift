import Foundation
import SwiftUI

@MainActor
final class KeyStore: ObservableObject {
    @Published var providers: [ProviderStatus] = []
    @Published var loading = false
    @Published var error: String?
    @Published var lastUpdated: Date?
    @Published var tunnelState: SSHTunnel.State = .stopped
    @Published var creditsCache: [String: CreditsResponse] = [:]

    private let client: DaemonClient
    private let tunnel: SSHTunnel
    private var refreshTimer: Timer?

    init(settings: AppSettings) {
        self.client = DaemonClient(settings: settings)
        self.tunnel = SSHTunnel(settings: settings)
        self.tunnel.onStateChange = { [weak self] s in
            Task { @MainActor in self?.tunnelState = s; self?.handleTunnelChange(s) }
        }
        self.tunnelState = tunnel.state
    }

    func start() {
        tunnel.start()
    }

    func stop() {
        refreshTimer?.invalidate()
        tunnel.stop()
    }

    func restartTunnel(with settings: AppSettings) {
        refreshTimer?.invalidate()
        tunnel.stop()
        // Rebuild with new settings
        objectWillChange.send()
    }

    private func handleTunnelChange(_ s: SSHTunnel.State) {
        if s == .connected { Task { await refresh() } }
    }

    func startAutoRefresh(seconds: Int) {
        refreshTimer?.invalidate()
        guard seconds > 0 else { return }
        refreshTimer = Timer.scheduledTimer(withTimeInterval: TimeInterval(seconds), repeats: true) { [weak self] _ in
            Task { @MainActor in await self?.refresh() }
        }
    }

    func refresh() async {
        guard tunnelState == .connected else { return }
        loading = true
        error = nil
        do {
            let result = try await client.status()
            providers = result
            lastUpdated = Date()
        } catch {
            self.error = error.localizedDescription
        }
        loading = false
    }

    func switchProfile(_ provider: String, _ name: String) async -> Bool {
        do {
            let r = try await client.set(provider: provider, name: name)
            if r.ok { await refresh(); return true }
            error = r.error ?? "switch failed"
            return false
        } catch {
            self.error = error.localizedDescription
            return false
        }
    }

    func loadCredits(_ provider: String) async -> CreditsResponse? {
        if let cached = creditsCache[provider] { return cached }
        do {
            let r = try await client.credits(provider: provider)
            creditsCache[provider] = r
            return r
        } catch {
            return CreditsResponse(provider: provider, error: error.localizedDescription, pioneer: nil, zen: nil, go: nil)
        }
    }

    func clearCredits() {
        creditsCache.removeAll()
    }
}
