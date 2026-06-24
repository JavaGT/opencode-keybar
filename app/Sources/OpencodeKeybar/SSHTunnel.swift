import Foundation

/// Manages an `ssh -N -L 127.0.0.1:local:127.0.0.1:remote host` tunnel process.
/// Keeps it alive; restarts on unexpected exit; notifies on state changes.
final class SSHTunnel: ObservableObject {
    @Published private(set) var state: State = .stopped
    enum State: Equatable {
        case stopped
        case starting
        case connected
        case failed(String)
    }

    private var process: Process?
    private var monitor: DispatchSourceProcess?
    private var restartAttempts = 0
    private let queue = DispatchQueue(label: "opencode.keybar.ssh")

    private let settings: AppSettings
    /// Fired on the main thread whenever connectivity changes.
    var onStateChange: ((State) -> Void)?

    init(settings: AppSettings) {
        self.settings = settings
    }

    func start() {
        queue.async { self._start() }
    }

    func stop() {
        queue.async { self._stop() }
    }

    private func _stop() {
        monitor?.cancel()
        monitor = nil
        if let p = process, p.isRunning {
            p.terminate()
        }
        process = nil
        setState(.stopped)
    }

    private func _start() {
        guard settings.sshHost.contains("@") || !settings.sshHost.isEmpty else {
            setState(.failed("No SSH host configured"))
            return
        }
        guard process == nil || process?.isRunning == false else { return }

        setState(.starting)
        let p = Process()
        p.launchPath = "/usr/bin/env"
        var args = ["ssh", "-N",
                    "-o", "ExitOnForwardFailure=yes",
                    "-o", "BatchMode=yes",
                    "-o", "ServerAliveInterval=30",
                    "-o", "ServerAliveCountMax=3",
                    "-o", "StrictHostKeyChecking=accept-new",
                    "-p", String(settings.sshPort),
                    "-L", "127.0.0.1:\(settings.localPort):127.0.0.1:\(settings.remotePort)"]
        if !settings.sshIdentityFile.isEmpty {
            args += ["-i", settings.sshIdentityFile]
        }
        args.append(settings.sshHost)
        p.arguments = args

        // Capture stderr so we can surface a useful error.
        let errPipe = Pipe()
        p.standardError = errPipe
        var stderrBuf = Data()
        errPipe.fileHandleForReading.readabilityHandler = { handle in
            let chunk = handle.availableData
            if !chunk.isEmpty { stderrBuf.append(chunk) }
        }

        do {
            try p.run()
        } catch {
            setState(.failed("ssh failed to launch: \(error.localizedDescription)"))
            scheduleRestart()
            return
        }
        process = p

        let src = DispatchSource.makeProcessSource(identifier: p.processIdentifier, eventMask: .exit, queue: queue)
        src.setEventHandler { [weak self] in
            guard let self else { return }
            let status = p.terminationStatus
            let msg = String(data: stderrBuf, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if status == 0 {
                self.setState(.stopped)
            } else {
                self.setState(.failed(msg.isEmpty ? "ssh exited (\(status))" : msg))
            }
            self.scheduleRestart()
        }
        src.resume()
        monitor = src

        // Give ssh a moment to establish the forward; if it hasn't exited, assume up.
        queue.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self, let p = self.process, p.isRunning else { return }
            self.restartAttempts = 0
            self.setState(.connected)
        }
    }

    private func scheduleRestart() {
        restartAttempts += 1
        let delay = min(30, 2 * restartAttempts)
        queue.asyncAfter(deadline: .now() + .seconds(delay)) { [weak self] in
            self?._start()
        }
    }

    private func setState(_ s: State) {
        DispatchQueue.main.async { [weak self] in
            self?.state = s
            self?.onStateChange?(s)
        }
    }
}
