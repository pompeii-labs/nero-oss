import SwiftUI

/// Settings: grouped holo-tinted cards with mono kickers, inset hairlines, ghost-holo
/// pill actions, and mono status pills — the Nero settings grammar.
struct SettingsView: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: NeroStore
    @AppStorage(NeroConfig.serverKey) private var serverURL: String = ""
    @AppStorage("nero.theme") private var themeId: String = "obsidian"

    @State private var secrets: [SecretMeta] = []
    @State private var mcp: [McpServer] = []
    @State private var edits: [String: String] = [:]
    @State private var models: [String: String] = [:]
    @State private var modelEdits: [String: String] = [:]
    @State private var newKey = ""
    @State private var newValue = ""
    @State private var busy = false

    /// API key -> label for the four model roles.
    private let modelRoles: [(key: String, label: String)] = [
        ("model", "Base"), ("voiceModel", "Voice"), ("planModel", "Planning"), ("subagentModel", "Subagents"),
    ]

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(spacing: 22) {
                    connectionSection
                    modelsSection
                    appearanceSection
                    secretsSection
                    mcpSection
                }
                .padding(16)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { Atmosphere() }
        .task { await reload() }
    }

    private var modelsSection: some View {
        SettingsSection(title: "Models") {
            ForEach(Array(modelRoles.enumerated()), id: \.element.key) { i, r in
                SettingsRow(first: i == 0) { modelRow(r.key, r.label) }
            }
        }
    }

    private func modelRow(_ key: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(label).font(Typeface.mono(11.5)).tracking(0.5).foregroundStyle(theme.textDim)
                Spacer()
                Text(models[key] ?? "…").font(Typeface.mono(10.5)).foregroundStyle(theme.textFaint)
                    .lineLimit(1).truncationMode(.middle)
            }
            HStack(spacing: 8) {
                NeroField(placeholder: "provider/model-slug", text: modelBinding(key))
                GhostPill(title: "save", disabled: (modelEdits[key] ?? "").trimmingCharacters(in: .whitespaces).isEmpty || busy) {
                    saveModel(key)
                }
            }
        }
    }

    private func modelBinding(_ key: String) -> Binding<String> {
        Binding(get: { modelEdits[key] ?? "" }, set: { modelEdits[key] = $0 })
    }

    private func saveModel(_ key: String) {
        let v = (modelEdits[key] ?? "").trimmingCharacters(in: .whitespaces)
        guard !v.isEmpty else { return }
        Task { busy = true; await store.client.setModel(role: key, v); modelEdits[key] = ""; await reload(); busy = false }
    }

    private var header: some View {
        HStack {
            Text("Settings").font(Typeface.display(22)).foregroundStyle(theme.text)
            Spacer()
            IconButton(system: "xmark", size: 30, iconSize: 13, radius: 8) { dismiss() }
        }
        .padding(.horizontal, 18).padding(.top, 16).padding(.bottom, 12)
        .overlay(alignment: .bottom) { Rectangle().fill(theme.holo(0.08)).frame(height: 1) }
    }

    private var connectionSection: some View {
        SettingsSection(title: "Connection") {
            SettingsRow(first: true) {
                HStack {
                    Text(serverURL).font(Typeface.mono(12)).foregroundStyle(theme.textDim).lineLimit(1).truncationMode(.middle)
                    Spacer()
                    StatusPill(text: store.connected ? "online" : "connecting", tone: store.connected ? .on : .warn)
                }
            }
            SettingsRow(first: false) {
                HStack {
                    Spacer()
                    GhostPill(title: "disconnect", destructive: true) {
                        NeroConfig.clear(); serverURL = ""
                    }
                }
            }
        }
    }

    private var appearanceSection: some View {
        SettingsSection(title: "Appearance") {
            SettingsRow(first: true) {
                HStack(spacing: 8) {
                    ForEach(Theme.all) { t in
                        Button { themeId = t.id } label: {
                            Text(t.displayName)
                                .font(Typeface.mono(11)).tracking(0.4)
                                .foregroundStyle(themeId == t.id ? theme.void_ : theme.textDim)
                                .frame(maxWidth: .infinity).padding(.vertical, 8)
                                .background(themeId == t.id ? t.holo() : theme.holo(0.05),
                                            in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                        }
                        .buttonStyle(PressableButtonStyle())
                    }
                }
            }
        }
    }

    private var secretsSection: some View {
        SettingsSection(title: "Secrets") {
            if secrets.isEmpty {
                SettingsRow(first: true) {
                    Text("No secrets yet.").font(Typeface.mono(11)).foregroundStyle(theme.textFaint)
                }
            }
            ForEach(Array(secrets.enumerated()), id: \.element.id) { i, s in
                SettingsRow(first: i == 0) { secretRow(s) }
            }
            SettingsRow(first: secrets.isEmpty) { addSecretRow }
        }
    }

    private func secretRow(_ s: SecretMeta) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(s.key).font(Typeface.mono(12.5)).foregroundStyle(theme.text)
                Spacer()
                StatusPill(text: s.isPlaceholder ? "needs value" : "set", tone: s.isPlaceholder ? .warn : .on)
            }
            if let d = s.description, !d.isEmpty {
                Text(d).font(Typeface.ui(11)).foregroundStyle(theme.textDim)
            }
            HStack(spacing: 8) {
                NeroField(placeholder: s.isPlaceholder ? "paste value…" : "update value…",
                          text: binding(s.key), secure: true)
                GhostPill(title: "save", disabled: (edits[s.key] ?? "").isEmpty || busy) { save(s.key) }
                IconButton(system: "trash", size: 30, iconSize: 13, radius: 7, tint: theme.holo2()) { remove(s.key) }
            }
        }
    }

    private var addSecretRow: some View {
        VStack(alignment: .leading, spacing: 8) {
            NeroField(placeholder: "NEW_SECRET_NAME", text: $newKey)
            HStack(spacing: 8) {
                NeroField(placeholder: "value", text: $newValue, secure: true)
                GhostPill(title: "add", disabled: newKey.trimmingCharacters(in: .whitespaces).isEmpty || newValue.isEmpty || busy) { addSecret() }
            }
        }
    }

    private var mcpSection: some View {
        SettingsSection(title: "MCP") {
            if mcp.isEmpty {
                SettingsRow(first: true) {
                    Text("No MCP servers.").font(Typeface.mono(11)).foregroundStyle(theme.textFaint)
                }
            }
            ForEach(Array(mcp.enumerated()), id: \.element.id) { i, m in
                SettingsRow(first: i == 0) { mcpRow(m) }
            }
        }
    }

    private func mcpRow(_ m: McpServer) -> some View {
        HStack(spacing: 10) {
            Circle().fill(m.connected ? theme.holo() : theme.textFaint).frame(width: 6, height: 6)
            VStack(alignment: .leading, spacing: 2) {
                Text(m.name).font(Typeface.mono(12.5)).foregroundStyle(theme.text)
                Text(m.connected ? "\(m.tools?.count ?? 0) tools" : "offline")
                    .font(Typeface.mono(10)).foregroundStyle(theme.textDim)
            }
            Spacer()
            GhostPill(title: m.connected ? "disconnect" : "reconnect", destructive: m.connected, disabled: busy) {
                mcpAction(m.name, m.connected ? "disconnect" : "reconnect")
            }
        }
    }

    // MARK: actions
    private func binding(_ key: String) -> Binding<String> {
        Binding(get: { edits[key] ?? "" }, set: { edits[key] = $0 })
    }
    private func save(_ key: String) {
        let v = edits[key] ?? ""; guard !v.isEmpty else { return }
        Task { busy = true; await store.client.setSecret(key, v); edits[key] = ""; await reload(); busy = false }
    }
    private func addSecret() {
        let k = newKey.trimmingCharacters(in: .whitespaces); guard !k.isEmpty, !newValue.isEmpty else { return }
        Task { busy = true; await store.client.setSecret(k, newValue); newKey = ""; newValue = ""; await reload(); busy = false }
    }
    private func remove(_ key: String) {
        Task { busy = true; await store.client.deleteSecret(key); await reload(); busy = false }
    }
    private func mcpAction(_ name: String, _ action: String) {
        Task { busy = true; await store.client.mcpAction(name, action); await reload(); busy = false }
    }
    private func reload() async {
        async let s = store.client.secrets()
        async let m = store.client.mcpList()
        async let mods = store.client.getModels()
        secrets = await s; mcp = await m
        if let c = await mods {
            models = [
                "model": c.model ?? "", "voiceModel": c.voiceModel ?? "",
                "planModel": c.planModel ?? "", "subagentModel": c.subagentModel ?? "",
            ]
        }
    }
}
