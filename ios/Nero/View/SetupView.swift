import SwiftUI

struct SetupView: View {
    @EnvironmentObject var neroManager: NeroManager
    @EnvironmentObject var toastManager: ToastManager

    @State private var connectionMode: ConnectionMode = .local
    @State private var serverURL = ""
    @State private var licenseKey = ""
    @State private var isConnecting = false
    @State private var errorMessage: String?
    @State private var showAdvanced = false

    enum ConnectionMode: String, CaseIterable {
        case local = "Local"
        case tunnel = "Tunnel"
    }

    var body: some View {
        ZStack {
            NeroBackgroundView()

            ScrollView {
                VStack(spacing: 32) {
                    Spacer().frame(height: 40)

                    headerSection
                        .floatUp(delay: 0)

                    connectionModeSection
                        .floatUp(delay: 0.1)

                    if connectionMode == .local {
                        localConnectionSection
                            .floatUp(delay: 0.2)
                    } else {
                        tunnelConnectionSection
                            .floatUp(delay: 0.2)
                    }

                    connectButton
                        .floatUp(delay: 0.3)

                    if let error = errorMessage {
                        errorSection(error)
                    }

                    helpSection
                        .floatUp(delay: 0.4)

                    Spacer().frame(height: 40)
                }
                .padding(24)
            }
        }
    }

    private var headerSection: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Color.neroBlue.opacity(0.1))
                    .frame(width: 120, height: 120)
                    .blur(radius: 30)

                Image(systemName: "brain.head.profile")
                    .font(.system(size: 56, weight: .light))
                    .foregroundStyle(LinearGradient.neroGradient)
                    .neroGlowStrong()
            }
            .holoRing()
            .frame(width: 100, height: 100)

            VStack(spacing: 8) {
                Text("Nero")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundStyle(LinearGradient.neroGradient)

                Text("Connect to your AI companion")
                    .font(.subheadline)
                    .foregroundColor(.nMutedForeground)
            }
        }
    }

    private var connectionModeSection: some View {
        VStack(alignment: .leading, spacing: 12) {
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
        }
        .glassCard()
        .padding(16)
    }

    private var requiresLicenseKey: Bool {
        let url = serverURL.lowercased()
        let isLocalhost = url.contains("localhost") || url.contains("127.0.0.1")
        return !isLocalhost && !serverURL.isEmpty
    }

    private var localConnectionSection: some View {
        VStack(alignment: .leading, spacing: 16) {
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
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.circle.fill")
                            .foregroundColor(.nWarning)
                            .font(.caption)
                        Text("License key required for LAN connections")
                            .font(.caption.weight(.medium))
                            .foregroundColor(.nWarning)
                    }

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

                    Text("Only localhost/127.0.0.1 can connect without a license key")
                        .font(.caption)
                        .foregroundColor(.nMutedForeground)
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .glassCard()
        .padding(16)
        .animation(.spring(response: 0.3), value: requiresLicenseKey)
    }

    private var tunnelConnectionSection: some View {
        VStack(alignment: .leading, spacing: 16) {
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

                Text("Connect to Nero from anywhere via secure tunnel")
                    .font(.caption)
                    .foregroundColor(.nMutedForeground)
            }
        }
        .glassCard()
        .padding(16)
    }

    private var connectButton: some View {
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

    private func errorSection(_ error: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.nError)
                .neroGlowSubtle()

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

    private var helpSection: some View {
        VStack(spacing: 16) {
            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [.clear, Color.nBorder, .clear],
                        startPoint: .leading,
                        endPoint: .trailing
                    )
                )
                .frame(height: 1)

            VStack(alignment: .leading, spacing: 16) {
                helpItem(
                    icon: "wifi",
                    title: "Local Network",
                    description: "Connect to Nero on your network. Use localhost or 127.0.0.1 to skip auth, or provide a license key for LAN IPs."
                )

                helpItem(
                    icon: "globe",
                    title: "Tunnel",
                    description: "Connect from anywhere with your license key. Requires Nero to be running with tunnel enabled."
                )
            }
        }
        .padding(.top, 8)
    }

    private func helpItem(icon: String, title: String, description: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundStyle(LinearGradient.neroGradient)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(.white)

                Text(description)
                    .font(.caption)
                    .foregroundColor(.nMutedForeground)
                    .fixedSize(horizontal: false, vertical: true)
            }
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
                        errorMessage = "Could not connect. Check the URL and ensure Nero is running. If your server has a license key, enter it in Advanced."
                    }
                } else {
                    await MainActor.run {
                        toastManager.success("Connected to Nero")
                    }
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
                        errorMessage = "No tunnel available. Make sure Nero is running with a license key configured."
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
                        errorMessage = "Could not connect via tunnel. Ensure Nero is running."
                    }
                } else {
                    await MainActor.run {
                        toastManager.success("Connected via tunnel")
                    }
                }
            }
        }
    }
}

#Preview {
    SetupView()
        .environmentObject(NeroManager.shared)
        .environmentObject(ToastManager.shared)
}
