import Foundation

enum NeroConfig {
    static let serverKey = "nero.serverURL"
    /// Shared across the app + its extensions (Share sheet, widgets, Live Activity) so
    /// they all resolve the same server without re-onboarding.
    static let appGroup = "group.com.pompeii.nero"
    /// Optional baked-in default so a personal build skips onboarding. NOT committed:
    /// it comes from `NERO_DEFAULT_SERVER_HOST` in the gitignored Local.xcconfig,
    /// surfaced via Info.plist. Empty in the open-source repo (fresh installs onboard).
    static var defaultURL: String {
        let host = Bundle.main.object(forInfoDictionaryKey: "NeroDefaultServerHost") as? String
        guard let host, !host.isEmpty else { return "" }
        return "https://\(host)"
    }

    private static var defaults: UserDefaults {
        UserDefaults(suiteName: appGroup) ?? .standard
    }

    /// Copy the effective server URL into the shared App Group suite so the Share sheet,
    /// widgets, and Live Activity resolve it. Call once at launch.
    static func primeSharedDefaults() {
        if let u = serverURL { defaults.set(u.absoluteString, forKey: serverKey) }
    }

    static var serverURL: URL? {
        // Prefer the shared suite; fall back to the legacy standard store (migration),
        // then the baked-in default. Explicitly cleared ("") -> nil (back to onboarding).
        let s =
            defaults.string(forKey: serverKey)
            ?? UserDefaults.standard.string(forKey: serverKey)
            ?? defaultURL
        guard !s.isEmpty, let u = URL(string: s) else { return nil }
        return u
    }
    static func setServer(_ s: String) {
        let v = s.trimmingCharacters(in: .whitespaces)
        defaults.set(v, forKey: serverKey)
        UserDefaults.standard.set(v, forKey: serverKey)
    }
    static func clear() {
        defaults.set("", forKey: serverKey)
        UserDefaults.standard.set("", forKey: serverKey)
    }
}

/// Thin HTTP wrapper over Nero's API. All realtime comes from RealtimeStream; this
/// is the write side (send, cancel, panel/ask/project actions, settings, push).
struct NeroClient {
    let base: URL

    // MARK: chat
    struct Upload { let data: Data; let mime: String; let name: String }

    func send(_ text: String, attachments: [Upload] = []) async throws {
        var body: [String: Any] = ["text": text]
        if !attachments.isEmpty {
            body["attachments"] = attachments.map {
                ["data": $0.data.base64EncodedString(), "mimeType": $0.mime, "name": $0.name]
            }
        }
        _ = try await post("/v1/nero", body)
    }
    func cancel() async { _ = try? await post("/v1/nero/cancel", [:]) }

    /// A one-off voice errand (from the App Intent): fire-and-forget, and Nero always
    /// pushes the result when he's done, even if you were just in the app.
    func sendErrand(_ text: String) async throws {
        _ = try await post("/v1/nero", ["text": text, "errand": true])
    }

    /// Foreground heartbeat so the server knows a surface is on-screen (suppresses push).
    func heartbeat() async { _ = try? await post("/v1/presence/heartbeat", [:]) }

    // MARK: commands
    func getModel() async -> String? {
        (try? await getJSON("/v1/settings", SettingsResponse.self))?.model
    }
    /// All four model roles (base / voice / planning / subagents).
    func getModels() async -> ModelsConfig? {
        try? await getJSON("/v1/settings", ModelsConfig.self)
    }
    /// Set one role. `role` is the API key: model | voiceModel | planModel | subagentModel.
    func setModel(role: String, _ slug: String) async {
        _ = try? await post("/v1/settings", [role: slug])
    }
    func compact() async -> String {
        guard let d = try? await post("/v1/compact", [:]),
              let r = try? JSONDecoder().decode(CompactResponse.self, from: d) else {
            return "Failed to compact."
        }
        return r.compacted ? "Memory compacted, older history folded into the summary." : "Already compact."
    }

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

    // MARK: actions (the orb's radial dial)
    /// Custom actions the user or Nero bound to dial slots. Built-in wedges are
    /// client-side and never come back from here.
    func actions() async -> [DialAction] {
        (try? await getJSON("/v1/actions", ActionsResponse.self))?.actions ?? []
    }

    /// Fire a script or prompt action. A `builtin` in the reply means the slot is one
    /// the screen owns and the caller should handle it locally.
    func runAction(_ id: String) async -> ActionRunResult {
        guard let d = try? await post("/v1/actions/\(id)/run", [:]),
              let r = try? JSONDecoder().decode(ActionRunResult.self, from: d) else {
            return ActionRunResult(ok: false, output: "couldn't reach Nero", builtin: nil)
        }
        return r
    }

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
struct SettingsResponse: Codable { let model: String? }
struct ModelsConfig: Codable {
    let model: String?
    let voiceModel: String?
    let planModel: String?
    let subagentModel: String?
}
struct CompactResponse: Codable { let compacted: Bool; let summary: String? }
struct DialAction: Codable, Identifiable {
    let id: String
    /// 0-7 clockwise from twelve o'clock, or -1 when unbound.
    let slot: Int
    let label: String
    let icon: String
    let kind: String
    let confirm: Bool
}
struct ActionsResponse: Codable { let actions: [DialAction] }
struct ActionRunResult: Codable { let ok: Bool; let output: String; let builtin: String? }
