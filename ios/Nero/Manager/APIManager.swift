import Foundation

enum ChatEvent {
    case chunk(String)
    case activity(ToolActivity)
    case permission(String, ToolActivity)
    case done(String)
    case error(String)
}

@MainActor
class APIManager: ObservableObject {
    static let shared = APIManager()

    @Published var isLoading = false

    private var currentTask: Task<Void, Never>?

    private var baseURL: String {
        NeroManager.shared.serverURL
    }

    private var licenseKey: String {
        NeroManager.shared.licenseKey
    }

    private init() {}

    private func buildRequest(endpoint: String, method: String = "GET", body: Data? = nil) -> URLRequest {
        let url = URL(string: "\(baseURL)\(endpoint)")!
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 120

        if !licenseKey.isEmpty {
            request.setValue(licenseKey, forHTTPHeaderField: "x-license-key")
        }

        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = body
        }

        if method == "POST" && endpoint.contains("/chat") {
            request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        }

        return request
    }

    func streamChat(message: String) -> AsyncThrowingStream<ChatEvent, Error> {
        AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let body = try JSONEncoder().encode(["message": message, "medium": "api:ios"])
                    let request = buildRequest(endpoint: "/api/chat", method: "POST", body: body)

                    let (bytes, response) = try await URLSession.shared.bytes(for: request)

                    guard let httpResponse = response as? HTTPURLResponse else {
                        continuation.finish(throwing: APIError.invalidResponse)
                        return
                    }

                    if httpResponse.statusCode != 200 {
                        continuation.finish(throwing: APIError.httpError(httpResponse.statusCode))
                        return
                    }

                    for try await line in bytes.lines {
                        if Task.isCancelled { break }

                        guard line.hasPrefix("data: ") else { continue }
                        let json = String(line.dropFirst(6))

                        if json == "{}" { continue }

                        guard let data = json.data(using: .utf8),
                              let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                              let type = parsed["type"] as? String else {
                            continue
                        }

                        switch type {
                        case "chunk":
                            if let chunk = parsed["data"] as? String {
                                continuation.yield(.chunk(chunk))
                            }
                        case "activity":
                            if let activityData = parsed["data"],
                               let activityJson = try? JSONSerialization.data(withJSONObject: activityData),
                               let activity = try? JSONDecoder().decode(ToolActivity.self, from: activityJson) {
                                continuation.yield(.activity(activity))
                            }
                        case "permission":
                            if let id = parsed["id"] as? String,
                               let activityData = parsed["data"],
                               let activityJson = try? JSONSerialization.data(withJSONObject: activityData),
                               let activity = try? JSONDecoder().decode(ToolActivity.self, from: activityJson) {
                                continuation.yield(.permission(id, activity))
                            }
                        case "done":
                            if let doneData = parsed["data"] as? [String: Any],
                               let content = doneData["content"] as? String {
                                continuation.yield(.done(content))
                            }
                        case "error":
                            if let errorMsg = parsed["data"] as? String {
                                continuation.yield(.error(errorMsg))
                            }
                        default:
                            break
                        }
                    }

                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }

            continuation.onTermination = { _ in
                task.cancel()
            }
        }
    }

    func respondToPermission(id: String, approved: Bool) async throws {
        let body = try JSONEncoder().encode(["approved": approved])
        let request = buildRequest(endpoint: "/api/permission/\(id)", method: "POST", body: body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.permissionFailed
        }
    }

    func getHistory() async throws -> [Message] {
        let request = buildRequest(endpoint: "/api/history")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let historyResponse = try JSONDecoder().decode(HistoryResponse.self, from: data)
        return historyResponse.messages.map { $0.toMessage() }
    }

    func getMemories() async throws -> [Memory] {
        let request = buildRequest(endpoint: "/api/memories")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        return try JSONDecoder().decode([Memory].self, from: data)
    }

    func deleteMemory(id: Int) async throws {
        let request = buildRequest(endpoint: "/api/memories/\(id)", method: "DELETE")
        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    func createMemory(body: String) async throws -> Memory {
        let requestBody = try JSONEncoder().encode(["body": body])
        let request = buildRequest(endpoint: "/api/memories", method: "POST", body: requestBody)
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        return try JSONDecoder().decode(Memory.self, from: data)
    }

    func getContext() async throws -> ContextInfo {
        let request = buildRequest(endpoint: "/api/context")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        return try JSONDecoder().decode(ContextInfo.self, from: data)
    }

    func compact() async throws -> String {
        let request = buildRequest(endpoint: "/api/compact", method: "POST")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        struct CompactResponse: Codable {
            let success: Bool
            let summary: String?
        }

        let result = try JSONDecoder().decode(CompactResponse.self, from: data)
        return result.summary ?? "Context compacted successfully"
    }

    func clear() async throws {
        let request = buildRequest(endpoint: "/api/clear", method: "POST")
        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    func abort() async throws {
        let request = buildRequest(endpoint: "/api/abort", method: "POST")
        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    func getLogs(lines: Int = 200, level: String? = nil) async throws -> [LogEntry] {
        var endpoint = "/api/logs?lines=\(lines)"
        if let level = level { endpoint += "&level=\(level)" }
        let request = buildRequest(endpoint: endpoint)
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let logsResponse = try JSONDecoder().decode(LogsResponse.self, from: data)
        return logsResponse.entries
    }

    func streamLogs(level: String? = nil, onEntry: @escaping (LogEntry) -> Void) -> Task<Void, Never> {
        Task {
            do {
                var endpoint = "/api/logs/stream"
                if let level = level { endpoint += "?level=\(level)" }
                let request = buildRequest(endpoint: endpoint)

                let (bytes, response) = try await URLSession.shared.bytes(for: request)

                guard let httpResponse = response as? HTTPURLResponse,
                      httpResponse.statusCode == 200 else { return }

                for try await line in bytes.lines {
                    if Task.isCancelled { break }
                    guard line.hasPrefix("data: ") else { continue }
                    let json = String(line.dropFirst(6))
                    if json == "{}" { continue }

                    guard let data = json.data(using: .utf8) else { continue }
                    if let entry = try? JSONDecoder().decode(LogEntry.self, from: data),
                       !entry.timestamp.isEmpty {
                        await MainActor.run { onEntry(entry) }
                    }
                }
            } catch {}
        }
    }

    func getMcpServers() async throws -> (servers: [McpServerConfig], tools: [String]) {
        let request = buildRequest(endpoint: "/api/mcp/servers")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        let mcpResponse = try JSONDecoder().decode(McpServersResponse.self, from: data)
        let servers = mcpResponse.servers.map { (name, config) in
            McpServerConfig(
                name: name,
                transport: config.transport,
                command: config.command,
                args: config.args,
                url: config.url,
                disabled: config.disabled
            )
        }.sorted { $0.name < $1.name }

        return (servers: servers, tools: mcpResponse.tools)
    }

    func toggleMcpServer(name: String, disabled: Bool) async throws {
        let body = try JSONEncoder().encode(["disabled": disabled])
        let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        let request = buildRequest(endpoint: "/api/mcp/servers/\(encoded)/toggle", method: "POST", body: body)
        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    func removeMcpServer(name: String) async throws {
        let encoded = name.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? name
        let request = buildRequest(endpoint: "/api/mcp/servers/\(encoded)", method: "DELETE")
        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }
    }

    func reload() async throws -> Int {
        let request = buildRequest(endpoint: "/api/reload", method: "POST")
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200 else {
            throw APIError.httpError((response as? HTTPURLResponse)?.statusCode ?? 0)
        }

        struct ReloadResponse: Codable {
            let success: Bool
            let mcpTools: Int
        }

        let result = try JSONDecoder().decode(ReloadResponse.self, from: data)
        return result.mcpTools
    }
}

enum APIError: LocalizedError {
    case invalidResponse
    case httpError(Int)
    case permissionFailed
    case decodingError

    var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server"
        case .httpError(let code):
            return "HTTP error: \(code)"
        case .permissionFailed:
            return "Failed to respond to permission"
        case .decodingError:
            return "Failed to decode response"
        }
    }
}
