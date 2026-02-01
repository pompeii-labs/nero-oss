import Foundation

struct ToolActivity: Identifiable, Codable, Equatable {
    let id: String
    let tool: String
    let args: [String: AnyCodable]
    var status: ToolStatus
    var result: String?
    var error: String?
    var skipReason: String?

    enum ToolStatus: String, Codable {
        case pending
        case approved
        case denied
        case skipped
        case running
        case complete
        case error
    }
}

struct AnyCodable: Codable, Equatable {
    let value: Any

    init(_ value: Any) {
        self.value = value
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            value = NSNull()
        } else if let bool = try? container.decode(Bool.self) {
            value = bool
        } else if let int = try? container.decode(Int.self) {
            value = int
        } else if let double = try? container.decode(Double.self) {
            value = double
        } else if let string = try? container.decode(String.self) {
            value = string
        } else if let array = try? container.decode([AnyCodable].self) {
            value = array.map { $0.value }
        } else if let dict = try? container.decode([String: AnyCodable].self) {
            value = dict.mapValues { $0.value }
        } else {
            value = NSNull()
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch value {
        case is NSNull:
            try container.encodeNil()
        case let bool as Bool:
            try container.encode(bool)
        case let int as Int:
            try container.encode(int)
        case let double as Double:
            try container.encode(double)
        case let string as String:
            try container.encode(string)
        case let array as [Any]:
            try container.encode(array.map { AnyCodable($0) })
        case let dict as [String: Any]:
            try container.encode(dict.mapValues { AnyCodable($0) })
        default:
            try container.encodeNil()
        }
    }

    static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
        String(describing: lhs.value) == String(describing: rhs.value)
    }
}

struct PermissionRequest: Identifiable {
    let id: String
    let activity: ToolActivity
}

enum TimelineItem: Identifiable {
    case message(Message)
    case activity(ToolActivity)

    var id: String {
        switch self {
        case .message(let message):
            return "msg-\(message.id)"
        case .activity(let activity):
            return "act-\(activity.id)"
        }
    }

    var message: Message? {
        if case .message(let msg) = self { return msg }
        return nil
    }

    var activity: ToolActivity? {
        if case .activity(let act) = self { return act }
        return nil
    }
}
