import Foundation

struct ServerInfo: Codable {
    let status: String
    let agent: AgentInfo

    struct AgentInfo: Codable {
        let contextUsage: Double
        let contextTokens: Int?
    }
}

struct ContextInfo: Codable {
    let tokens: Int
    let limit: Int
    let percentage: Double
    let mcpTools: [String]
}

struct APIInfo: Codable {
    let name: String
    let version: String
    let status: String
    let features: Features?

    struct Features: Codable {
        let voice: Bool?
        let sms: Bool?
        let database: Bool?
    }
}

struct LicenseVerifyResponse: Codable {
    let valid: Bool
    let active: Bool
    let tunnel_url: String?
}

struct LogEntry: Identifiable, Codable {
    var id: String { "\(timestamp)-\(source)-\(message.prefix(20))" }
    let timestamp: String
    let level: String
    let source: String
    let message: String

    var date: Date? {
        ISO8601DateFormatter().date(from: timestamp)
    }
}

struct LogsResponse: Codable {
    let count: Int
    let logFile: String?
    let entries: [LogEntry]
}

struct McpServerConfig: Codable, Identifiable {
    var id: String { name }
    let name: String
    let transport: String?
    let command: String?
    let args: [String]?
    let url: String?
    let disabled: Bool?
}

struct McpServersResponse: Codable {
    let servers: [String: McpServerConfigRaw]
    let tools: [String]
    let authStatus: [String: Bool]?
}

struct McpServerConfigRaw: Codable {
    let transport: String?
    let command: String?
    let args: [String]?
    let url: String?
    let disabled: Bool?
}
