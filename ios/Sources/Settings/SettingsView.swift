import SwiftUI

/// Settings: connection + theme, plus live Secrets and MCP management.
struct SettingsView: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: NeroStore
    @AppStorage(NeroConfig.serverKey) private var serverURL: String = ""
    @AppStorage("nero.theme") private var themeId: String = "obsidian"

    @State private var secrets: [SecretMeta] = []
    @State private var secretEdits: [String: String] = [:]
    @State private var newSecretKey = ""
    @State private var newSecretValue = ""
    @State private var mcp: [McpServer] = []
    @State private var busy = false

    var body: some View {
        NavigationStack {
            List {
                connectionSection
                themeSection
                secretsSection
                mcpSection
            }
            .scrollContentBackground(.hidden)
            .background(theme.void_)
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .task { await reload() }
        }
    }

    // MARK: connection

    private var connectionSection: some View {
        Section("Connection") {
            Text(serverURL)
                .font(Typeface.mono(12))
                .foregroundStyle(theme.textDim)
            HStack {
                Circle().fill(store.connected ? theme.holo() : Color(hex: 0xf5a524)).frame(width: 7, height: 7)
                Text(store.connected ? "Connected" : "Connecting…").font(Typeface.ui(14))
            }
            Button("Disconnect", role: .destructive) {
                NeroConfig.clear()
                serverURL = ""
            }
        }
    }

    private var themeSection: some View {
        Section("Theme") {
            Picker("Theme", selection: $themeId) {
                ForEach(Theme.all) { Text($0.displayName).tag($0.id) }
            }
            .pickerStyle(.segmented)
        }
    }

    // MARK: secrets

    private var secretsSection: some View {
        Section {
            ForEach(secrets) { s in secretRow(s) }
            addSecretRow
        } header: {
            Text("Secrets")
        } footer: {
            Text("API keys and tokens Nero uses. Values are write-only.")
                .font(Typeface.mono(10)).foregroundStyle(theme.textFaint)
        }
    }

    private func secretRow(_ s: SecretMeta) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(s.key).font(Typeface.mono(13)).foregroundStyle(theme.text)
                Spacer()
                Text(s.isPlaceholder ? "NEEDS VALUE" : "SET")
                    .font(Typeface.mono(9)).tracking(0.8)
                    .foregroundStyle(s.isPlaceholder ? Color(hex: 0xf5a524) : theme.holo())
            }
            if let d = s.description, !d.isEmpty {
                Text(d).font(Typeface.ui(11)).foregroundStyle(theme.textDim)
            }
            HStack(spacing: 8) {
                SecureField("New value", text: editBinding(s.key))
                    .font(Typeface.mono(12)).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Save") { save(s.key) }
                    .font(Typeface.mono(11)).tint(theme.holo())
                    .disabled((secretEdits[s.key] ?? "").isEmpty || busy)
                Button(role: .destructive) { remove(s.key) } label: {
                    Image(systemName: "trash").font(.system(size: 13))
                }
                .disabled(busy)
            }
        }
        .padding(.vertical, 2)
    }

    private var addSecretRow: some View {
        VStack(alignment: .leading, spacing: 6) {
            TextField("NEW_KEY", text: $newSecretKey)
                .font(Typeface.mono(12)).textInputAutocapitalization(.characters).autocorrectionDisabled()
            HStack(spacing: 8) {
                SecureField("Value", text: $newSecretValue)
                    .font(Typeface.mono(12)).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Add") { addSecret() }
                    .font(Typeface.mono(11)).tint(theme.holo())
                    .disabled(newSecretKey.trimmingCharacters(in: .whitespaces).isEmpty || newSecretValue.isEmpty || busy)
            }
        }
        .padding(.vertical, 2)
    }

    private func editBinding(_ key: String) -> Binding<String> {
        Binding(get: { secretEdits[key] ?? "" }, set: { secretEdits[key] = $0 })
    }

    private func save(_ key: String) {
        let value = secretEdits[key] ?? ""
        guard !value.isEmpty else { return }
        Task {
            busy = true
            await store.client.setSecret(key, value)
            secretEdits[key] = ""
            await reload()
            busy = false
        }
    }

    private func addSecret() {
        let key = newSecretKey.trimmingCharacters(in: .whitespaces)
        guard !key.isEmpty, !newSecretValue.isEmpty else { return }
        Task {
            busy = true
            await store.client.setSecret(key, newSecretValue)
            newSecretKey = ""
            newSecretValue = ""
            await reload()
            busy = false
        }
    }

    private func remove(_ key: String) {
        Task {
            busy = true
            await store.client.deleteSecret(key)
            await reload()
            busy = false
        }
    }

    // MARK: mcp

    private var mcpSection: some View {
        Section {
            if mcp.isEmpty {
                Text("No MCP servers configured.").font(Typeface.ui(12)).foregroundStyle(theme.textFaint)
            }
            ForEach(mcp) { m in mcpRow(m) }
        } header: {
            Text("MCP")
        }
    }

    private func mcpRow(_ m: McpServer) -> some View {
        HStack(spacing: 10) {
            Circle().fill(m.connected ? theme.holo() : theme.textFaint).frame(width: 6, height: 6)
            VStack(alignment: .leading, spacing: 2) {
                Text(m.name).font(Typeface.mono(13)).foregroundStyle(theme.text)
                Text(m.connected ? "\(m.tools?.count ?? 0) tools" : "offline")
                    .font(Typeface.mono(10)).foregroundStyle(theme.textDim)
            }
            Spacer()
            Button(m.connected ? "Disconnect" : "Reconnect") {
                mcpAction(m.name, m.connected ? "disconnect" : "reconnect")
            }
            .font(Typeface.mono(11))
            .tint(m.connected ? Color(hex: 0xf5a524) : theme.holo())
            .disabled(busy)
        }
    }

    private func mcpAction(_ name: String, _ action: String) {
        Task {
            busy = true
            await store.client.mcpAction(name, action)
            await reload()
            busy = false
        }
    }

    // MARK: data

    private func reload() async {
        async let s = store.client.secrets()
        async let m = store.client.mcpList()
        secrets = await s
        mcp = await m
    }
}
