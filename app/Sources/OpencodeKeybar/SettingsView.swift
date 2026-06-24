import SwiftUI

struct SettingsView: View {
    @ObservedObject var settingsBox: SettingsBox
    let onSave: (AppSettings) -> Void

    var body: some View {
        Form {
            Section("SSH") {
                TextField("Host (user@server)", text: $settingsBox.settings.sshHost)
                    .textContentType(.username)
                Stepper("Port: \(settingsBox.settings.sshPort)", value: $settingsBox.settings.sshPort, in: 1...65535)
                TextField("Identity file (optional)", text: $settingsBox.settings.sshIdentityFile)
                Stepper("Local port: \(settingsBox.settings.localPort)", value: $settingsBox.settings.localPort, in: 1024...65535)
                Stepper("Remote port: \(settingsBox.settings.remotePort)", value: $settingsBox.settings.remotePort, in: 1024...65535)
            }
            Section("Auth") {
                SecureField("Bearer token (optional)", text: $settingsBox.settings.authToken)
            }
            Section("Menu") {
                Stepper("Auto-refresh: \(settingsBox.settings.autoRefreshSeconds == 0 ? "off" : "\(settingsBox.settings.autoRefreshSeconds)s")", value: $settingsBox.settings.autoRefreshSeconds, in: 0...3600, step: 5)
                Toggle("Show providers without keys", isOn: $settingsBox.settings.showAllProviders)
            }
            Section {
                HStack {
                    Spacer()
                    Button("Save") { onSave(settingsBox.settings) }
                        .buttonStyle(.borderedProminent)
                }
            }
            Section {
                Text("Install the daemon on your server: run `server/install.sh` there. It listens on 127.0.0.1:\(settingsBox.settings.remotePort) and is reached via the SSH tunnel above.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .padding(20)
        .frame(width: 460)
    }
}
