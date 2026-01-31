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
