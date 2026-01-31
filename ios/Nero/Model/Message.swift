import Foundation

struct Message: Identifiable, Codable, Equatable {
    let id: String
    let role: MessageRole
    var content: String
    let createdAt: Date

    enum MessageRole: String, Codable {
        case user
        case assistant
    }

    init(id: String = UUID().uuidString, role: MessageRole, content: String, createdAt: Date = Date()) {
        self.id = id
        self.role = role
        self.content = content
        self.createdAt = createdAt
    }
}

struct HistoryMessage: Codable {
    let role: String
    let content: String
    let created_at: String

    func toMessage() -> Message {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: created_at) ?? Date()
        return Message(
            role: role == "user" ? .user : .assistant,
            content: content,
            createdAt: date
        )
    }
}

struct HistoryResponse: Codable {
    let messages: [HistoryMessage]
    let hasSummary: Bool
}
