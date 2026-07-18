import Foundation

enum NeroConfig {
    static let serverKey = "nero.serverURL"
    /// Baked-in default so a fresh install skips onboarding (works on/off LAN with
    /// Tailscale on). Disconnecting in Settings clears it and returns to onboarding.
    static let defaultURL = "https://nero-rig.tail37322a.ts.net"

    static var serverURL: URL? {
        // Unset -> the default; explicitly cleared ("") -> nil (back to onboarding).
        let s = UserDefaults.standard.string(forKey: serverKey) ?? defaultURL
        guard !s.isEmpty, let u = URL(string: s) else { return nil }
        return u
    }
    static func setServer(_ s: String) {
        UserDefaults.standard.set(s.trimmingCharacters(in: .whitespaces), forKey: serverKey)
    }
    static func clear() { UserDefaults.standard.set("", forKey: serverKey) }
}

/// Thin HTTP wrapper over Nero's API. All realtime comes from RealtimeStream; this
/// is the write side (send, cancel, panel/ask/project actions, settings, push).
struct NeroClient {
    let base: URL

    // MARK: chat
    func send(_ text: String) async throws {
        _ = try await post("/v1/nero", ["text": text])
    }
    func cancel() async { _ = try? await post("/v1/nero/cancel", [:]) }

    // MARK: panels
    func panelInteract(_ id: String, control: String, intent: String?, value: Any?) async {
        var body: [String: Any] = ["control": control]
        if let intent { body["intent"] = intent }
        if let value { body["value"] = value }
        _ = try? await post("/v1/panels/\(id)/interact", body)
    }
    func panelCall(_ id: String, fn: String) async {
        _ = try? await post("/v1/panels/\(id)/call", ["fn": fn])
    }
    func panelClose(_ id: String) async { _ = try? await post("/v1/panels/\(id)/close", [:]) }

    // MARK: ask
    func answer(_ id: String, answers: [[String]], dismiss: Bool = false) async {
        let body: [String: Any] = dismiss ? ["dismiss": true] : ["answers": answers]
        _ = try? await post("/v1/ask/\(id)/answer", body)
    }

    // MARK: projects
    func projectAction(_ id: String, _ action: String, body: [String: Any] = [:]) async {
        _ = try? await post("/v1/projects/\(id)/\(action)", body)
    }

    // MARK: settings
    func secrets() async -> [SecretMeta] {
        (try? await getJSON("/v1/secrets", SecretsResponse.self))?.secrets ?? []
    }
    func setSecret(_ key: String, _ value: String) async { _ = try? await post("/v1/secrets", ["key": key, "value": value]) }
    func deleteSecret(_ key: String) async { _ = try? await delete("/v1/secrets/\(key)") }
    func mcpList() async -> [McpServer] {
        (try? await getJSON("/v1/mcp/list", McpListResponse.self))?.integrations ?? []
    }
    func mcpAction(_ name: String, _ action: String) async { _ = try? await post("/v1/mcp/\(action)", ["name": name]) }

    // MARK: push
    func registerPush(_ token: String) async {
        _ = try? await post("/v1/push/register", ["token": token, "platform": "ios", "bundle_id": "com.pompeii.nero"])
    }

    // MARK: health (used by onboarding; /v1/health preferred, /health fallback)
    static func health(_ base: URL) async -> Bool {
        for path in ["/v1/health", "/health"] {
            guard let u = URL(string: path, relativeTo: base) else { continue }
            var req = URLRequest(url: u)
            req.timeoutInterval = 8
            if let (data, resp) = try? await URLSession.shared.data(for: req),
               let http = resp as? HTTPURLResponse, http.statusCode == 200,
               (try? JSONDecoder().decode(HealthResponse.self, from: data)) != nil {
                return true
            }
        }
        return false
    }

    // MARK: transport
    @discardableResult
    private func post(_ path: String, _ body: [String: Any]) async throws -> Data {
        var req = URLRequest(url: URL(string: path, relativeTo: base)!)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, _) = try await URLSession.shared.data(for: req)
        return data
    }
    @discardableResult
    private func delete(_ path: String) async throws -> Data {
        var req = URLRequest(url: URL(string: path, relativeTo: base)!)
        req.httpMethod = "DELETE"
        let (data, _) = try await URLSession.shared.data(for: req)
        return data
    }
    private func getJSON<T: Decodable>(_ path: String, _ type: T.Type) async throws -> T {
        let req = URLRequest(url: URL(string: path, relativeTo: base)!)
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(T.self, from: data)
    }
}

// MARK: response shapes
struct HealthResponse: Codable { let ok: Bool }
struct SecretMeta: Codable, Identifiable { var id: String { key }; let key: String; let isPlaceholder: Bool; let description: String? }
struct SecretsResponse: Codable { let secrets: [SecretMeta] }
struct McpServer: Codable, Identifiable { var id: String { name }; let name: String; let url: String?; let connected: Bool; let tools: [String]? }
struct McpListResponse: Codable { let integrations: [McpServer] }
