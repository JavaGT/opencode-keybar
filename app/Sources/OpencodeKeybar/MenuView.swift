import SwiftUI
import AppKit

struct MenuView: View {
    @ObservedObject var store: KeyStore
    @ObservedObject var settingsBox: SettingsBox
    let openSettingsAction: () -> Void
    @State private var busy: [String: Bool] = [:]
    @State private var showCredits: String?
    @State private var creditsResult: CreditsResponse?

    private var settings: AppSettings { settingsBox.settings }
    private var visibleProviders: [ProviderStatus] {
        settings.showAllProviders ? store.providers : store.providers.filter { $0.hasKey || !$0.profiles.isEmpty }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(visibleProviders, id: \.provider) { p in
                        providerSection(p)
                    }
                    if visibleProviders.isEmpty {
                        Text("No providers with keys.").foregroundStyle(.secondary)
                            .padding(.vertical, 8)
                    }
                }
                .padding(10)
            }
            Divider()
            footer
        }
        .frame(width: 340, height: 460)
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text("opencode keys").font(.headline)
                Text(statusLine).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                Task { await store.refresh() }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .help("Refresh")
        }
        .padding(8)
    }

    private var statusLine: String {
        switch store.tunnelState {
        case .connected:
            if let d = store.lastUpdated {
                return "Connected · updated \(d.formatted(.relative(presentation: .named)))"
            }
            return "Connected"
        case .starting: return "Connecting…"
        case .failed(let msg): return "Connection failed: \(msg.prefix(60))"
        case .stopped: return "Not connected"
        }
    }

    @ViewBuilder
    private func providerSection(_ p: ProviderStatus) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(p.label).font(.subheadline).fontWeight(.semibold)
                Spacer()
                if let active = p.profiles.first(where: { $0.active }) {
                    Text(active.name).foregroundStyle(.green).font(.caption)
                } else if let key = p.activeMaskedKey {
                    Text(key).foregroundStyle(.secondary).font(.caption2)
                } else {
                    Text("no key").foregroundStyle(.secondary).font(.caption2)
                }
                Button {
                    Task { await loadCredits(p.provider) }
                } label: {
                    Image(systemName: "creditcard")
                }
                .buttonStyle(.borderless)
                .help("Show credits")
            }
            ForEach(p.profiles, id: \.name) { prof in
                profileRow(p, prof)
            }
        }
    }

    @ViewBuilder
    private func profileRow(_ p: ProviderStatus, _ prof: ProfileStatus) -> some View {
        HStack {
            Image(systemName: prof.active ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(prof.active ? .green : .secondary)
            VStack(alignment: .leading, spacing: 0) {
                Text(prof.name).font(.callout)
                if let d = prof.description, !d.isEmpty {
                    Text(d).font(.caption2).foregroundStyle(.secondary)
                }
            }
            Spacer()
            if busy[p.provider + prof.name] == true {
                ProgressView().controlSize(.small)
            } else if !prof.active {
                Button("Use") {
                    Task { await switchTo(p.provider, prof.name) }
                }
                .buttonStyle(.borderless)
                .controlSize(.small)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            guard !prof.active else { return }
            Task { await switchTo(p.provider, prof.name) }
        }
    }

    @ViewBuilder
    private var footer: some View {
        VStack(spacing: 0) {
            if let provider = showCredits, let c = creditsResult {
                creditsView(provider: provider, c: c)
                    .padding(8)
                Divider()
            }
            HStack {
                Button("Settings…") { openSettingsAction() }
                Spacer()
                Button("Quit") { NSApplication.shared.terminate(nil) }
            }
            .padding(8)
        }
    }

    @ViewBuilder
    private func creditsView(provider: String, c: CreditsResponse) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Credits — \(provider)").font(.caption).fontWeight(.semibold)
            if let err = c.error {
                Text(err).font(.caption).foregroundStyle(.red)
            } else if let pioneer = c.pioneer {
                Text(String(format: "Used %.0f / %.0f cr · $%.2f left", pioneer.current_period_usage, pioneer.credit_limit, pioneer.remaining_usd)).font(.caption)
                if let reqs = pioneer.current_period_requests { Text("Requests: \(reqs)").font(.caption2).foregroundStyle(.secondary) }
            } else if let zen = c.zen {
                if let z = zen.zenCost { Text(String(format: "Zen cost: $%.2f", z)).font(.caption) }
                if let t = zen.totalCost { Text(String(format: "Total: $%.2f", t)).font(.caption) }
                if let m = zen.zenMessages { Text("Messages: \(m)").font(.caption2).foregroundStyle(.secondary) }
            } else if let go = c.go {
                if let mc = go.modelCount { Text("\(mc) models").font(.caption) }
                if let r = go.rolling { Text(String(format: "5h: %.0f%%", r.usagePercent)).font(.caption2) }
                if let w = go.weekly { Text(String(format: "7d: %.0f%%", w.usagePercent)).font(.caption2) }
                if let m = go.monthly { Text(String(format: "30d: %.0f%%", m.usagePercent)).font(.caption2) }
            }
        }
    }

    private func switchTo(_ provider: String, _ name: String) async {
        let key = provider + name
        busy[key] = true
        defer { busy[key] = false }
        _ = await store.switchProfile(provider, name)
    }

    private func loadCredits(_ provider: String) async {
        showCredits = provider
        creditsResult = await store.loadCredits(provider)
    }
}
