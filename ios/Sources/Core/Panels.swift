import Foundation

/// A panel field that is either a literal or a `{bind:"key"}` reference into the
/// panel's `state`. Mirrors `Bind`/`Str`/`Num` in web/src/lib/panels/types.ts.
struct Bound: Codable, Equatable {
    let bindKey: String?
    let literal: JSONValue?

    private enum Keys: String, CodingKey { case bind }

    init(from decoder: Decoder) throws {
        if let c = try? decoder.container(keyedBy: Keys.self), let k = try? c.decode(String.self, forKey: .bind) {
            bindKey = k
            literal = nil
        } else {
            let s = try decoder.singleValueContainer()
            bindKey = nil
            literal = try? s.decode(JSONValue.self)
        }
    }
    func encode(to encoder: Encoder) throws {
        if let k = bindKey {
            var c = encoder.container(keyedBy: Keys.self)
            try c.encode(k, forKey: .bind)
        } else {
            var s = encoder.singleValueContainer()
            try s.encode(literal ?? .null)
        }
    }

    func resolve(_ state: [String: JSONValue]) -> JSONValue? { bindKey != nil ? state[bindKey!] : literal }
    func string(_ state: [String: JSONValue]) -> String { resolve(state)?.stringValue ?? "" }
    func double(_ state: [String: JSONValue]) -> Double {
        if case .number(let n)? = resolve(state) { return n }
        return Double(resolve(state)?.stringValue?.filter { "0123456789.-".contains($0) } ?? "") ?? 0
    }
}

/// An array field that is either a literal array or a bind reference (list items, chart data).
struct BoundArray: Codable, Equatable {
    let bindKey: String?
    let literal: [JSONValue]?

    private enum Keys: String, CodingKey { case bind }

    init(from decoder: Decoder) throws {
        if let c = try? decoder.container(keyedBy: Keys.self), let k = try? c.decode(String.self, forKey: .bind) {
            bindKey = k
            literal = nil
        } else {
            let s = try decoder.singleValueContainer()
            bindKey = nil
            literal = try? s.decode([JSONValue].self)
        }
    }
    func encode(to encoder: Encoder) throws {
        if let k = bindKey {
            var c = encoder.container(keyedBy: Keys.self)
            try c.encode(k, forKey: .bind)
        } else {
            var s = encoder.singleValueContainer()
            try s.encode(literal ?? [])
        }
    }

    private func rows(_ state: [String: JSONValue]) -> [JSONValue] {
        if let k = bindKey, case .array(let a)? = state[k] { return a }
        return literal ?? []
    }
    func strings(_ state: [String: JSONValue]) -> [String] { rows(state).compactMap { $0.stringValue } }
    func numbers(_ state: [String: JSONValue]) -> [Double] {
        rows(state).compactMap { if case .number(let n) = $0 { return n }; return Double($0.stringValue ?? "") }
    }
}

struct PanelAction: Codable, Equatable {
    let type: String        // interact | call
    let intent: String?
    let value: JSONValue?
    let fn: String?
}

/// One node in a panel's component tree. Lenient (all fields optional) so Nero can
/// evolve the vocabulary without breaking the client; the renderer reads by `type`.
/// Not Identifiable on purpose (content-Equatable so panel diffing works); the
/// renderer keys ForEach by index.
struct Comp: Codable, Equatable {
    let type: String

    let text: Bound?
    let variant: String?
    let label: Bound?
    let action: PanelAction?
    let src: Bound?
    let alt: String?
    let height: Double?
    let fit: String?
    let value: Bound?
    let sub: Bound?
    let kind: String?
    let window: Int?
    let sampleMs: Int?
    let minVal: Double?
    let maxVal: Double?
    let items: BoundArray?
    let data: BoundArray?
    let ordered: Bool?
    let tone: String?
    let videoId: Bound?
    let session: String?
    let url: String?
    let children: [Comp]?
    let gap: Double?
    let align: String?

    enum CodingKeys: String, CodingKey {
        case type, text, variant, label, action, src, alt, height, fit, value, sub, kind
        case window, sampleMs, items, data, ordered, tone, videoId, session, url, children, gap, align
        case minVal = "min", maxVal = "max"
    }
}

struct Panel: Codable, Identifiable, Equatable {
    let id: String
    let device_id: String?
    let title: String?
    let components: [Comp]?
    let state: [String: JSONValue]?
    let functions: [String: JSONValue]?
    let status: String?
    let maximized: Bool?
    let updated_at: Int?

    var isOpen: Bool { status == "open" }
    var resolvedState: [String: JSONValue] { state ?? [:] }
}
