import SwiftUI

/// Settings. Connection + theme now; Secrets and MCP tabs land in the settings milestone.
struct SettingsView: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: NeroStore
    @AppStorage(NeroConfig.serverKey) private var serverURL: String = ""
    @AppStorage("nero.theme") private var themeId: String = "obsidian"

    var body: some View {
        NavigationStack {
            List {
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
                Section("Theme") {
                    Picker("Theme", selection: $themeId) {
                        ForEach(Theme.all) { Text($0.displayName).tag($0.id) }
                    }
                    .pickerStyle(.segmented)
                }
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
        }
    }
}
