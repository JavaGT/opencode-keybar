import Foundation

/// Talks to the daemon over http://127.0.0.1:localPort (reached via the SSH tunnel).
final class DaemonClient {
    private let settings: AppSettings

    init(settings: AppSettings) {
        self.settings = settings
    }

    private var baseURL: URL {
        URL(string: "http://127.0.0.1:\(settings.localPort)")!
    }

    private func request(_ path: String, method: String = "GET", body: Data? = nil) async throws -> Data {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.timeoutInterval = 15
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !settings.authToken.isEmpty {
            req.setValue("Bearer \(settings.authToken)", forHTTPHeaderField: "Authorization")
        }
        req.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: req)
        guard let http = response as? HTTPURLResponse else {
            throw URLError(.badServerResponse)
        }
        if !(200...299).contains(http.statusCode) {
            let msg = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw DaemonError.server(msg)
        }
        return data
    }

    func health() async throws -> Bool {
        do {
            let data = try await request("/health")
            return (try? JSONDecoder().decode(HealthResponse.self, from: data))?.ok ?? false
        } catch {
            return false
        }
    }

    func status() async throws -> [ProviderStatus] {
        let data = try await request("/status")
        return (try JSONDecoder().decode(StatusResponse.self, from: data)).providers
    }

    func set(provider: String, name: String) async throws -> MutationResponse {
        let body = try JSONEncoder().encode(SetRequest(provider: provider, name: name))
        let data = try await request("/set", method: "POST", body: body)
        return try JSONDecoder().decode(MutationResponse.self, from: data)
    }

    func add(provider: String, name: String, key: String, description: String?) async throws -> MutationResponse {
        let body = try JSONEncoder().encode(AddRequest(provider: provider, name: name, key: key, description: description))
        let data = try await request("/add", method: "POST", body: body)
        return try JSONDecoder().decode(MutationResponse.self, from: data)
    }

    func delete(provider: String, name: String) async throws -> MutationResponse {
        let body = try JSONEncoder().encode(DeleteRequest(provider: provider, name: name))
        let data = try await request("/delete", method: "POST", body: body)
        return try JSONDecoder().decode(MutationResponse.self, from: data)
    }

    func credits(provider: String) async throws -> CreditsResponse {
        let data = try await request("/credits/\(provider)")
        return try JSONDecoder().decode(CreditsResponse.self, from: data)
    }
}

enum DaemonError: LocalizedError {
    case server(String)
    var errorDescription: String? {
        switch self {
        case .server(let msg): return msg
        }
    }
}
