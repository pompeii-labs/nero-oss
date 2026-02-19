import SwiftUI

struct SettingsView: View {
    @Binding var showMenu: Bool

    @EnvironmentObject var neroManager: NeroManager
    @EnvironmentObject var toastManager: ToastManager
    @State private var contextInfo: ContextInfo?
    @State private var isCompacting = false
    @State private var isReloading = false
    @State private var showDisconnectConfirm = false

    @State private var connectionMode: ConnectionMode = .local
    @State private var serverURL = ""
    @State private var licenseKey = ""
    @State private var isConnecting = false
    @State private var errorMessage: String?

    enum ConnectionMode: String, CaseIterable {
        case local = "Local"
        case tunnel = "Remote"
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NeroBackgroundView()

                ScrollView {
                    VStack(spacing: 20) {
                        connectionSection
                            .floatUp(delay: 0)

                        if neroManager.isConnected {
                            contextSection
                                .floatUp(delay: 0.1)
                            actionsSection
                                .floatUp(delay: 0.2)
                        }

                        aboutSection
                            .floatUp(delay: neroManager.isConnected ? 0.3 : 0.1)
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
            if neroManager.isConnected {
                await loadContext()
            }
            if !neroManager.serverURL.isEmpty {
                serverURL = neroManager.serverURL
            }
            if !neroManager.licenseKey.isEmpty {
                licenseKey = neroManager.licenseKey
            }
            if neroManager.connectionMode == .tunnel {
                connectionMode = .tunnel
            }
        }
        .alert("Disconnect", isPresented: $showDisconnectConfirm) {
            Button("Cancel", role: .cancel) {}
            Button("Disconnect", role: .destructive) {
                neroManager.disconnect()
                contextInfo = nil
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

            if neroManager.isConnected {
                connectedInfo
            } else {
                connectionConfig
            }
        }
        .padding(16)
        .glassCard()
    }

    private var connectedInfo: some View {
        VStack(spacing: 12) {
            HStack {
                ZStack {
                    Circle()
                        .fill(Color.nSuccess.opacity(0.2))
                        .frame(width: 36, height: 36)

                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.nSuccess)
                        .font(.system(size: 18))
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text("Connected")
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
                        Text("Remote")
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

    private var connectionConfig: some View {
        VStack(spacing: 16) {
            HStack(spacing: 12) {
                ForEach(ConnectionMode.allCases, id: \.self) { mode in
                    Button {
                        withAnimation(.spring(response: 0.3)) {
                            connectionMode = mode
                            errorMessage = nil
                        }
                    } label: {
                        HStack {
                            Image(systemName: mode == .local ? "wifi" : "globe")
                                .font(.system(size: 14))

                            Text(mode.rawValue)
                                .font(.subheadline.weight(.medium))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(
                            connectionMode == mode
                                ? LinearGradient.neroGradient
                                : LinearGradient(colors: [Color.nCard], startPoint: .top, endPoint: .bottom)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(
                                    connectionMode == mode
                                        ? Color.clear
                                        : Color.nBorder,
                                    lineWidth: 1
                                )
                        )
                    }
                    .foregroundColor(.white)
                }
            }

            if connectionMode == .local {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Server URL", systemImage: "link")
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(.white)

                    TextField("http://192.168.1.100:4848", text: $serverURL)
                        .textFieldStyle(.plain)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .foregroundColor(.white)
                        .padding()
                        .inputGlow()
                }

                if requiresLicenseKey {
                    licenseKeyField
                        .transition(.opacity.combined(with: .move(edge: .top)))
                }
            } else {
                licenseKeyField
            }

            if let error = errorMessage {
                HStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.nError)

                    Text(error)
                        .font(.subheadline)
                        .foregroundColor(.white.opacity(0.9))
                }
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.nError.opacity(0.15))
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.nError.opacity(0.3), lineWidth: 1)
                )
                .transition(.opacity.combined(with: .scale(scale: 0.95)))
            }

            Button(action: connect) {
                HStack(spacing: 12) {
                    if isConnecting {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            .scaleEffect(0.9)
                    } else {
                        Image(systemName: "bolt.fill")
                            .font(.system(size: 16))
                    }
                    Text(isConnecting ? "Connecting..." : "Connect")
                        .font(.headline)
                }
                .neroButton()
            }
            .disabled(isConnecting || !canConnect)
            .opacity(canConnect ? 1 : 0.5)
        }
        .animation(.spring(response: 0.3), value: requiresLicenseKey)
    }

    private var licenseKeyField: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("License Key", systemImage: "key.fill")
                .font(.subheadline.weight(.medium))
                .foregroundColor(.white)

            SecureField("Enter your license key", text: $licenseKey)
                .textFieldStyle(.plain)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .foregroundColor(.white)
                .padding()
                .inputGlow()

            if connectionMode == .local && requiresLicenseKey {
                Text("Only localhost/127.0.0.1 can connect without a license key")
                    .font(.caption)
                    .foregroundColor(.nMutedForeground)
            } else if connectionMode == .tunnel {
                Text("Connect from anywhere with your license key")
                    .font(.caption)
                    .foregroundColor(.nMutedForeground)
            }
        }
    }

    private var requiresLicenseKey: Bool {
        let url = serverURL.lowercased()
        let isLocalhost = url.contains("localhost") || url.contains("127.0.0.1")
        return !isLocalhost && !serverURL.isEmpty
    }

    private var canConnect: Bool {
        if connectionMode == .local {
            if requiresLicenseKey {
                return !serverURL.isEmpty && !licenseKey.isEmpty
            }
            return !serverURL.isEmpty
        } else {
            return !licenseKey.isEmpty
        }
    }

    private func connect() {
        isConnecting = true
        errorMessage = nil

        Task {
            defer {
                Task { @MainActor in
                    isConnecting = false
                }
            }

            if connectionMode == .local {
                var url = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
                if !url.hasPrefix("http://") && !url.hasPrefix("https://") {
                    url = "http://" + url
                }
                url = url.trimmingCharacters(in: CharacterSet(charactersIn: "/"))

                neroManager.configure(
                    serverURL: url,
                    licenseKey: licenseKey.trimmingCharacters(in: .whitespacesAndNewlines),
                    mode: .local
                )

                let connected = await neroManager.checkConnection()
                if !connected {
                    await MainActor.run {
                        errorMessage = "Could not connect. Check the URL and ensure Nero is running."
                    }
                } else {
                    await MainActor.run {
                        toastManager.success("Connected to Nero")
                    }
                    await loadContext()
                }
            } else {
                let key = licenseKey.trimmingCharacters(in: .whitespacesAndNewlines)

                guard let verifyResponse = await neroManager.verifyLicenseKey(key) else {
                    await MainActor.run {
                        errorMessage = "Failed to verify license key. Check your internet connection."
                    }
                    return
                }

                guard verifyResponse.valid && verifyResponse.active else {
                    await MainActor.run {
                        errorMessage = "License key is invalid or inactive"
                    }
                    return
                }

                guard let tunnelUrl = verifyResponse.tunnel_url, !tunnelUrl.isEmpty else {
                    await MainActor.run {
                        errorMessage = "No relay available. Make sure Nero is running with a license key configured."
                    }
                    return
                }

                neroManager.configure(
                    serverURL: tunnelUrl,
                    licenseKey: key,
                    mode: .tunnel
                )

                let connected = await neroManager.checkConnection()
                if !connected {
                    await MainActor.run {
                        errorMessage = "Could not connect remotely. Ensure Nero is running."
                    }
                } else {
                    await MainActor.run {
                        toastManager.success("Connected remotely")
                    }
                    await loadContext()
                }
            }
        }
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
