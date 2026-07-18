import Foundation

/// A persisted chat/message row streamed over `/v1/stream` (`event: message`).
struct ChatMessage: Codable, Identifiable, Equatable {
    let id: Int
    let role: String?
    let type: String?
    let content: String?
    let created_at: Int?
    let dispatch_id: String?

    /// Rendered as a chat bubble (user/assistant text). System and tool rows are ignored.
    var isBubble: Bool {
        guard role == "user" || role == "assistant" else { return false }
        let t = type ?? "message"
        guard t == "message" || t == "agent_text" else { return false }
        return !(content ?? "").isEmpty
    }

    var isUser: Bool { role == "user" }
}

/// A tool invocation inside the live dispatch.
struct Activity: Codable, Identifiable, Equatable {
    let id: String
    let tool: String
    let displayName: String?
    let status: String
    let result: String?

    var label: String { displayName ?? tool }
}

/// The live in-flight turn streamed over `/v1/stream` (`event: dispatch`).
struct Dispatch: Codable, Equatable {
    let id: String
    let status: String?
    let streaming_text: String?
    let activities: [Activity]?
    let updated_at: Int?

    /// True while the turn is still producing output.
    var isActive: Bool {
        switch status {
        case "thinking", "running", "compacting":
            return true
        default:
            return false
        }
    }
}

/// `GET /v1/health` (or `/health`).
struct HealthResponse: Codable {
    let ok: Bool
    let lux: Bool?
}

/// `POST /v1/nero`.
struct SendResponse: Codable {
    let dispatchId: String?
    let steered: Bool?
}

/// `POST /v1/nero/cancel`.
struct CancelResponse: Codable {
    let cancelled: String?
}
