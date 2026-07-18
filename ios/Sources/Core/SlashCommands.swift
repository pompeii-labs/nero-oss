import Foundation

/// A slash command runnable from the composer. `run` returns the text to show the user
/// in a result card. Commands map to the `/v1` API; the set here is what the current
/// backend supports (memory/context/skills/clear need new endpoints, added later).
struct SlashCommand: Identifiable {
    var id: String { name }
    let name: String
    let aliases: [String]
    let description: String
    let run: @MainActor (_ store: NeroStore, _ args: [String]) async -> String
}

enum Slash {
    static let commands: [SlashCommand] = [
        SlashCommand(name: "help", aliases: ["h", "?"], description: "Show available commands") { _, _ in
            commands.map { c in
                let a = c.aliases.isEmpty ? "" : " (\(c.aliases.joined(separator: ", ")))"
                return "/\(c.name)\(a) — \(c.description)"
            }.joined(separator: "\n")
        },
        SlashCommand(name: "model", aliases: ["m"], description: "Show or set the model (OpenRouter slug)") { store, args in
            if args.isEmpty {
                let m = await store.client.getModel()
                return m.map { "Current model: \($0)" } ?? "Failed to read the model."
            }
            let slug = args.joined(separator: "/")
            return await store.client.setModel(slug)
                ? "Model set to \(slug). Takes effect on your next message."
                : "Failed to set the model."
        },
        SlashCommand(name: "mcp", aliases: ["integrations", "tools"], description: "Show connected integrations") { store, _ in
            let list = await store.client.mcpList()
            if list.isEmpty { return "No integrations connected." }
            return list.map { "\($0.connected ? "●" : "○") \($0.name) — \($0.connected ? "\($0.tools?.count ?? 0) tools" : "offline")" }
                .joined(separator: "\n")
        },
        SlashCommand(name: "status", aliases: ["health"], description: "Show Nero status") { store, _ in
            async let model = store.client.getModel()
            async let mcp = store.client.mcpList()
            let (m, servers) = await (model, mcp)
            let connected = servers.filter { $0.connected }.count
            let tools = servers.reduce(0) { $0 + ($1.connected ? ($1.tools?.count ?? 0) : 0) }
            return "Model: \(m ?? "unknown")\nIntegrations: \(connected)/\(servers.count) connected, \(tools) tools\nLink: \(store.connected ? "online" : "offline")"
        },
        SlashCommand(name: "compact", aliases: [], description: "Fold older history into a summary") { store, _ in
            await store.client.compact()
        },
        SlashCommand(name: "abort", aliases: ["stop", "cancel"], description: "Stop the current request") { store, _ in
            await store.client.cancel()
            return "Request aborted."
        },
    ]

    static func suggestions(_ partial: String) -> [SlashCommand] {
        let p = partial.lowercased()
        return commands.filter { $0.name.hasPrefix(p) || $0.aliases.contains { $0.hasPrefix(p) } }
    }

    static func find(_ name: String) -> SlashCommand? {
        let n = name.lowercased()
        return commands.first { $0.name == n || $0.aliases.contains(n) }
    }

    /// Parse a raw composer string. Returns (command, args) if it's a valid slash command.
    static func parse(_ input: String) -> (SlashCommand, [String])? {
        guard input.hasPrefix("/") else { return nil }
        let parts = input.dropFirst().split(separator: " ").map(String.init)
        guard let name = parts.first, let cmd = find(name) else { return nil }
        return (cmd, Array(parts.dropFirst()))
    }
}
