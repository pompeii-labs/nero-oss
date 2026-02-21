import Foundation

struct GraphNode: Codable, Identifiable {
    let id: Int
    let type: String
    let label: String
    let body: String?
    let strength: Double
    let category: String?
    let access_count: Int
    let last_accessed: String?
    let created_at: String
}

struct GraphEdge: Codable, Identifiable {
    let id: Int
    let source: Int
    let target: Int
    let relation: String
    let weight: Double
}

struct GraphData: Codable {
    let nodes: [GraphNode]
    let edges: [GraphEdge]
}

struct ToolFire: Equatable {
    let name: String
    let seq: Int
}
