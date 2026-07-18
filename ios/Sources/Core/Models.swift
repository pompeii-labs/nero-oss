import Foundation

/// A tolerant JSON value, for free-form fields (panel state, question items, etc.).
enum JSONValue: Codable, Equatable {
    case string(String), number(Double), bool(Bool), object([String: JSONValue]), array([JSONValue]), null

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let b = try? c.decode(Bool.self) { self = .bool(b) }
        else if let n = try? c.decode(Double.self) { self = .number(n) }
        else if let s = try? c.decode(String.self) { self = .string(s) }
        else if let a = try? c.decode([JSONValue].self) { self = .array(a) }
        else if let o = try? c.decode([String: JSONValue].self) { self = .object(o) }
        else { self = .null }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .object(let o): try c.encode(o)
        case .array(let a): try c.encode(a)
        case .null: try c.encodeNil()
        }
    }
    var stringValue: String? {
        switch self {
        case .string(let s): return s
        case .number(let n): return n == n.rounded() ? String(Int(n)) : String(n)
        case .bool(let b): return String(b)
        default: return nil
        }
    }
}

// MARK: - Chat

struct ChatMessage: Codable, Identifiable, Equatable {
    let id: Int
    let role: String?     // user | assistant | system
    let type: String?     // message | agent_text | tool_call | interaction
    let content: String?
    let dispatch_id: String?
    let created_at: Int?

    var isUser: Bool { role == "user" }
    var isAssistant: Bool { role == "assistant" }
    /// Rows we render as chat bubbles (not tool_call / interaction plumbing).
    var isBubble: Bool { (type == "message" || type == "agent_text") && (isUser || isAssistant) }
}

struct Activity: Codable, Identifiable, Equatable {
    let id: String
    let tool: String?
    let displayName: String?
    let status: String?   // running | success | error
    let result: String?
}

struct DispatchState: Codable, Identifiable, Equatable {
    let id: String
    let status: String?
    let streaming_text: String?
    let activities: [Activity]?
    let updated_at: Int?

    var isActive: Bool { ["thinking", "running", "compacting"].contains(status ?? "") }
}

// MARK: - Ask / questions

struct AskOption: Codable, Equatable, Identifiable {
    var id: String { label }
    let label: String
    let description: String?
}
struct AskItem: Codable, Equatable, Identifiable {
    var id: String { question }
    let question: String
    let header: String?
    let options: [AskOption]
    let multi: Bool?
}
struct Question: Codable, Identifiable, Equatable {
    let id: String
    let items: [AskItem]?
    let answers: [[String]?]?
    let status: String?   // pending | answered | cancelled | timeout
    let created_at: Int?
    var isPending: Bool { status == "pending" }
}

// MARK: - Projects

struct MergeConflict: Codable, Equatable {
    let task_idx: Int?
    let task_title: String?
    let files: [String]?
    let diff: String?
}
struct Project: Codable, Identifiable, Equatable {
    let id: String
    let title: String?
    let goal: String?
    let status: String?   // planning | awaiting_approval | running | paused | done | error | cancelled
    let budget_usd: Double?
    let spent_usd: Double?
    let est_cost_usd: Double?
    let result: String?
    let summary: String?
    let error: String?
    let dismissed: Bool?
    let merge_conflict: MergeConflict?
    let created_at: Int?
    let updated_at: Int?
}

struct ProjectTask: Codable, Identifiable, Equatable {
    let id: String
    let project_id: String?
    let idx: Int?
    let title: String?
    let status: String?   // pending | running | done | failed | skipped | cancelled
    let streaming_text: String?
    let cost_usd: Double?
    let updated_at: Int?
}
