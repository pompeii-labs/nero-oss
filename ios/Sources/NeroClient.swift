import Foundation

/// Owns the connection to a Nero server: base URL, send/cancel/health, and the
/// realtime SSE stream (`/v1/stream`). Publishes the persisted message list and the
/// current live dispatch for the UI to render.
@MainActor
final class NeroClient: ObservableObject {
    @Published private(set) var messages: [ChatMessage] = []
    @Published private(set) var dispatch: Dispatch?
    @Published private(set) var connected = false
    @Published private(set) var backfilled = false

    private(set) var baseURL: URL?
    private var streamTask: Task<Void, Never>?

    private let session: URLSession = {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 3600
        cfg.timeoutIntervalForResource = .infinity
        cfg.waitsForConnectivity = true
        return URLSession(configuration: cfg)
    }()

    // MARK: - Lifecycle

    /// Point the client at a server and (re)start the stream. No-op if already there.
    func configure(baseURLString: String) {
        let trimmed = baseURLString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = NeroClient.normalize(trimmed) else { return }
        if baseURL == url && streamTask != nil { return }
        baseURL = url
        restart()
    }

    func disconnect() {
        streamTask?.cancel()
        streamTask = nil
        connected = false
        backfilled = false
        messages = []
        dispatch = nil
        baseURL = nil
    }

    private func restart() {
        streamTask?.cancel()
        messages = []
        dispatch = nil
        backfilled = false
        streamTask = Task { await self.streamLoop() }
    }

    // MARK: - Derived state

    /// Persisted bubbles, in order.
    var bubbles: [ChatMessage] {
        messages.filter { $0.isBubble }
    }

    /// Whether the live dispatch bubble should be shown (active and not yet superseded
    /// by a persisted assistant message for the same dispatch).
    var showLiveBubble: Bool {
        guard let d = dispatch, d.isActive else { return false }
        let superseded = messages.contains {
            $0.role == "assistant" && $0.dispatch_id == d.id
                && (($0.type ?? "message") == "message" || $0.type == "agent_text")
                && !($0.content ?? "").isEmpty
        }
        return !superseded
    }

    // MARK: - Actions

    func send(_ text: String) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let url = endpoint("/v1/nero") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "content-type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["text": trimmed])
        _ = try? await session.data(for: req)
    }

    func cancel() async {
        guard let url = endpoint("/v1/nero/cancel") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        _ = try? await session.data(for: req)
    }

    /// Validate a server URL for onboarding. Tries `/v1/health`, falls back to `/health`.
    static func checkHealth(baseURLString: String) async -> Bool {
        guard let base = normalize(baseURLString) else { return false }
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 10
        let s = URLSession(configuration: cfg)
        for path in ["/v1/health", "/health"] {
            guard let url = URL(string: base.absoluteString + path) else { continue }
            if let (data, resp) = try? await s.data(from: url),
               let http = resp as? HTTPURLResponse, http.statusCode == 200 {
                if let health = try? JSONDecoder().decode(HealthResponse.self, from: data) {
                    return health.ok
                }
                return true
            }
        }
        return false
    }

    // MARK: - SSE stream

    private func streamLoop() async {
        var backoff: UInt64 = 1
        while !Task.isCancelled {
            do {
                try await connectStream()
                backoff = 1
            } catch {
                // fall through to reconnect
            }
            if Task.isCancelled { break }
            connected = false
            try? await Task.sleep(nanoseconds: min(backoff, 15) * 1_000_000_000)
            backoff = min(backoff * 2, 15)
        }
    }

    private func connectStream() async throws {
        guard let url = endpoint("/v1/stream") else { return }
        var req = URLRequest(url: url)
        req.timeoutInterval = 3600
        req.setValue("text/event-stream", forHTTPHeaderField: "accept")

        let (bytes, response) = try await session.bytes(for: req)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        connected = true

        var event = ""
        var dataLines: [String] = []
        for try await line in bytes.lines {
            if Task.isCancelled { break }
            if line.isEmpty {
                handleSSE(event: event, data: dataLines.joined(separator: "\n"))
                event = ""
                dataLines.removeAll()
                continue
            }
            if line.hasPrefix("event:") {
                event = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst(5).trimmingCharacters(in: .whitespaces)))
            }
        }
    }

    private func handleSSE(event: String, data: String) {
        guard let payload = data.data(using: .utf8) else { return }
        switch event {
        case "message":
            if let m = try? JSONDecoder().decode(ChatMessage.self, from: payload) {
                merge(m)
            }
        case "dispatch":
            if let d = try? JSONDecoder().decode(Dispatch.self, from: payload) {
                dispatch = d
            }
        case "ready":
            backfilled = true
        default:
            break
        }
    }

    private func merge(_ m: ChatMessage) {
        if let idx = messages.firstIndex(where: { $0.id == m.id }) {
            messages[idx] = m
        } else {
            messages.append(m)
            messages.sort { $0.id < $1.id }
        }
    }

    // MARK: - Helpers

    private func endpoint(_ path: String) -> URL? {
        guard let base = baseURL else { return nil }
        return URL(string: base.absoluteString + path)
    }

    /// Normalize to a scheme://host[:port] base with no trailing slash.
    static func normalize(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var comps = URLComponents(string: trimmed),
              let scheme = comps.scheme, scheme == "http" || scheme == "https",
              comps.host != nil else { return nil }
        var path = comps.path
        while path.hasSuffix("/") { path.removeLast() }
        comps.path = path
        comps.query = nil
        comps.fragment = nil
        return comps.url
    }
}
