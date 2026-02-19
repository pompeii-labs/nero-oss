import Foundation

struct Memory: Identifiable, Codable, Equatable {
    let id: Int
    let body: String
    let related_to: [Int]?
    let category: String?
    let created_at: String

    var createdDate: Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: created_at) ?? Date()
    }

    var isCore: Bool {
        category == "core"
    }
}
