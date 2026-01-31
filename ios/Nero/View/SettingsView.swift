import SwiftUI

struct SettingsView: View {
    @Binding var showMenu: Bool

    @EnvironmentObject var neroManager: NeroManager
    @EnvironmentObject var toastManager: ToastManager
    @State private var contextInfo: ContextInfo?
    @State private var isCompacting = false
    @State private var isReloading = false
    @State private var showDisconnectConfirm = false

    var body: some View {
        NavigationStack {
            ZStack {
                NeroBackgroundView()

                ScrollView {
                    VStack(spacing: 20) {
                        connectionSection
                            .floatUp(delay: 0)
                        contextSection
                            .floatUp(delay: 0.1)
                        actionsSection
                            .floatUp(delay: 0.2)
                        aboutSection
                            .floatUp(delay: 0.3)
                    }
                    .padding()
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.nBackground.opacity(0.8), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        showMenu = true
                    } label: {
                        Image(systemName: "line.3.horizontal")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(LinearGradient.neroGradient)
                    }
                }
            }
        }
        .task {
            await loadContext()
        }
        .alert("Disconnect", isPresented: $showDisconnectConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Disconnect", role: .destructive) {
                neroManager.disconnect()
            }
        } message: {
            Text("Are you sure you want to disconnect from this Nero server?")
        }
    }

    private var connectionSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Connection", systemImage: "wifi")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.nMutedForeground)

            VStack(spacing: 12) {
                HStack {
                    ZStack {
                        Circle()
                            .fill(neroManager.isConnected ? Color.nSuccess.opacity(0.2) : Color.nError.opacity(0.2))
                            .frame(width: 36, height: 36)

                        Image(systemName: neroManager.isConnected ? "checkmark.circle.fill" : "xmark.circle.fill")
                            .foregroundColor(neroManager.isConnected ? .nSuccess : .nError)
                            .font(.system(size: 18))
                    }

                    VStack(alignment: .leading, spacing: 2) {
                        Text(neroManager.isConnected ? "Connected" : "Disconnected")
                            .font(.subheadline.weight(.medium))
                            .foregroundColor(.white)

                        if !neroManager.serverURL.isEmpty {
                            Text(neroManager.serverURL)
                                .font(.caption)
                                .foregroundColor(.nMutedForeground)
                                .lineLimit(1)
                        }
                    }

                    Spacer()

                    if neroManager.connectionMode == .tunnel {
                        HStack(spacing: 4) {
                            Image(systemName: "globe")
                                .font(.caption2)
                            Text("Tunnel")
                                .font(.caption)
                        }
                        .foregroundColor(.neroBlue)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(Color.neroBlue.opacity(0.15))
                        .clipShape(Capsule())
                        .overlay(
                            Capsule()
                                .stroke(Color.neroBlue.opacity(0.3), lineWidth: 1)
                        )
                    }
                }

                if let apiInfo = neroManager.apiInfo {
                    Divider()
                        .background(Color.nBorder)

                    HStack {
                        Text("Version")
                            .font(.subheadline)
                            .foregroundColor(.nMutedForeground)
                        Spacer()
                        Text(apiInfo.version)
                            .font(.subheadline.monospaced())
                            .foregroundColor(.white)
                    }

                    if let features = apiInfo.features {
                        HStack {
                            Text("Features")
                                .font(.subheadline)
                                .foregroundColor(.nMutedForeground)
                            Spacer()
                            HStack(spacing: 6) {
                                if features.voice == true {
                                    featureBadge("Voice", icon: "waveform")
                                }
                                if features.sms == true {
                                    featureBadge("SMS", icon: "message")
                                }
                                if features.database == true {
                                    featureBadge("DB", icon: "cylinder")
                                }
                            }
                        }
                    }
                }

                Button {
                    showDisconnectConfirm = true
                } label: {
                    HStack {
                        Image(systemName: "xmark.circle")
                        Text("Disconnect")
                    }
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.nError)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color.nError.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                    .overlay(
                        RoundedRectangle(cornerRadius: 10)
                            .stroke(Color.nError.opacity(0.3), lineWidth: 1)
                    )
                }
            }
        }
        .padding(16)
        .glassCard()
    }

    private func featureBadge(_ text: String, icon: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.caption2)
            Text(text)
                .font(.caption2)
        }
        .foregroundColor(.neroCyan)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Color.neroCyan.opacity(0.1))
        .clipShape(Capsule())
    }

    private var contextSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Context", systemImage: "brain")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.nMutedForeground)

            if let context = contextInfo {
                VStack(spacing: 16) {
                    HStack {
                        Text("Usage")
                            .font(.subheadline)
                            .foregroundColor(.white)
                        Spacer()
                        Text("\(Int(context.percentage))%")
                            .font(.headline.monospacedDigit())
                            .foregroundColor(contextColor(context.percentage))
                    }

                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            RoundedRectangle(cornerRadius: 6)
                                .fill(Color.nCard)
                                .frame(height: 12)

                            RoundedRectangle(cornerRadius: 6)
                                .fill(
                                    LinearGradient(
                                        colors: [contextColor(context.percentage), contextColor(context.percentage).opacity(0.6)],
                                        startPoint: .leading,
                                        endPoint: .trailing
                                    )
                                )
                                .frame(width: geo.size.width * min(context.percentage / 100, 1), height: 12)
                                .shadow(color: contextColor(context.percentage).opacity(0.5), radius: 4)
                        }
                    }
                    .frame(height: 12)

                    HStack {
                        HStack(spacing: 4) {
                            Image(systemName: "number")
                                .font(.caption2)
                            Text("\(formatNumber(context.tokens)) / \(formatNumber(context.limit))")
                                .font(.caption.monospacedDigit())
                        }
                        .foregroundColor(.nMutedForeground)

                        Spacer()

                        if !context.mcpTools.isEmpty {
                            HStack(spacing: 4) {
                                Image(systemName: "wrench.and.screwdriver")
                                    .font(.caption2)
                                Text("\(context.mcpTools.count) tools")
                                    .font(.caption)
                            }
                            .foregroundColor(.neroCyan)
                        }
                    }
                }
            } else {
                HStack {
                    Text("Loading context...")
                        .font(.subheadline)
                        .foregroundColor(.nMutedForeground)
                    Spacer()
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .neroBlue))
                        .scaleEffect(0.8)
                }
            }
        }
        .padding(16)
        .glassCard()
    }

    private var actionsSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("Actions", systemImage: "bolt")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.nMutedForeground)

            VStack(spacing: 10) {
                actionButton(
                    icon: "arrow.down.right.and.arrow.up.left",
                    title: "Compact Context",
                    subtitle: "Reduce token usage",
                    isLoading: isCompacting
                ) {
                    Task { await compactContext() }
                }

                actionButton(
                    icon: "arrow.clockwise",
                    title: "Reload MCP Config",
                    subtitle: "Refresh available tools",
                    isLoading: isReloading
                ) {
                    Task { await reloadConfig() }
                }

                Button {
                    Task { await clearHistory() }
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "trash")
                            .font(.system(size: 16))
                            .foregroundColor(.nError)
                            .frame(width: 36, height: 36)
                            .background(Color.nError.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 8))

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Clear Conversation")
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(.nError)
                            Text("Start fresh")
                                .font(.caption)
                                .foregroundColor(.nMutedForeground)
                        }

                        Spacer()

                        Image(systemName: "chevron.right")
                            .font(.caption)
                            .foregroundColor(.nMutedForeground)
                    }
                    .padding(12)
                    .background(Color.nCard)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.nError.opacity(0.2), lineWidth: 1)
                    )
                }
            }
        }
        .padding(16)
        .glassCard()
    }

    private func actionButton(icon: String, title: String, subtitle: String, isLoading: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 16))
                    .foregroundStyle(LinearGradient.neroGradient)
                    .frame(width: 36, height: 36)
                    .background(Color.neroBlue.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8))

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(.white)
                    Text(subtitle)
                        .font(.caption)
                        .foregroundColor(.nMutedForeground)
                }

                Spacer()

                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .neroBlue))
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.caption)
                        .foregroundColor(.nMutedForeground)
                }
            }
            .padding(12)
            .background(Color.nCard)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.nBorder, lineWidth: 1)
            )
        }
        .disabled(isLoading)
    }

    private var aboutSection: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("About", systemImage: "info.circle")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.nMutedForeground)

            VStack(spacing: 0) {
                HStack {
                    HStack(spacing: 10) {
                        Image(systemName: "app.badge")
                            .foregroundStyle(LinearGradient.neroGradient)
                        Text("App Version")
                            .font(.subheadline)
                            .foregroundColor(.white)
                    }
                    Spacer()
                    Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                        .font(.subheadline.monospaced())
                        .foregroundColor(.nMutedForeground)
                }
                .padding(14)

                Divider()
                    .background(Color.nBorder)

                Link(destination: URL(string: "https://github.com/pompeii-labs/nero-oss")!) {
                    HStack {
                        HStack(spacing: 10) {
                            Image(systemName: "link")
                                .foregroundStyle(LinearGradient.neroGradient)
                            Text("GitHub")
                                .font(.subheadline)
                                .foregroundColor(.white)
                        }
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.caption)
                            .foregroundColor(.nMutedForeground)
                    }
                    .padding(14)
                }
            }
            .background(Color.nCard)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.nBorder, lineWidth: 1)
            )
        }
        .padding(16)
        .glassCard()
    }

    private func loadContext() async {
        do {
            contextInfo = try await APIManager.shared.getContext()
        } catch {
            print("Failed to load context: \(error)")
        }
    }

    private func compactContext() async {
        isCompacting = true
        defer { isCompacting = false }

        do {
            let summary = try await APIManager.shared.compact()
            toastManager.success("Context compacted")
            await loadContext()
            print("Compaction summary: \(summary)")
        } catch {
            toastManager.error("Failed to compact context")
        }
    }

    private func reloadConfig() async {
        isReloading = true
        defer { isReloading = false }

        do {
            let toolCount = try await APIManager.shared.reload()
            toastManager.success("Reloaded \(toolCount) MCP tools")
            await loadContext()
        } catch {
            toastManager.error("Failed to reload config")
        }
    }

    private func clearHistory() async {
        do {
            try await APIManager.shared.clear()
            toastManager.success("Conversation cleared")
            await loadContext()
        } catch {
            toastManager.error("Failed to clear conversation")
        }
    }

    private func contextColor(_ percentage: Double) -> Color {
        if percentage < 50 {
            return .nSuccess
        } else if percentage < 80 {
            return .nWarning
        } else {
            return .nError
        }
    }

    private func formatNumber(_ n: Int) -> String {
        if n >= 1000 {
            return String(format: "%.1fk", Double(n) / 1000)
        }
        return "\(n)"
    }
}

#Preview {
    SettingsView(showMenu: .constant(false))
        .environmentObject(NeroManager.shared)
        .environmentObject(ToastManager.shared)
        .preferredColorScheme(.dark)
}
