import SwiftUI

/// App root. Onboarding when no server URL is stored, otherwise the chat UI.
struct RootView: View {
    @AppStorage(PushRegistration.serverURLKey) private var serverURL: String = ""
    @StateObject private var client = NeroClient()
    @State private var showSettings = false

    private var hasServer: Bool {
        NeroClient.normalize(serverURL) != nil
    }

    var body: some View {
        Group {
            if hasServer {
                NavigationStack {
                    ChatView(client: client, baseURL: client.baseURL)
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button {
                                    showSettings = true
                                } label: {
                                    Image(systemName: "gearshape")
                                }
                            }
                        }
                        .navigationTitle("Nero")
                        .navigationBarTitleDisplayMode(.inline)
                }
                .sheet(isPresented: $showSettings) {
                    SettingsView(serverURL: $serverURL)
                }
            } else {
                OnboardingView(serverURL: $serverURL)
            }
        }
        .preferredColorScheme(.dark)
        .onAppear { syncClient() }
        .onChange(of: serverURL) { syncClient() }
    }

    private func syncClient() {
        if hasServer {
            client.configure(baseURLString: serverURL)
            PushRegistration.reregister()
        } else {
            client.disconnect()
        }
    }
}

/// First-run setup: enter a server URL, validate via health, store it.
struct OnboardingView: View {
    @Binding var serverURL: String
    @State private var draft = ""
    @State private var checking = false
    @State private var errorText: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 24) {
                Spacer()
                VStack(spacing: 8) {
                    Text("Nero")
                        .font(.system(size: 44, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                    Text("Connect to your Nero server")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.6))
                }

                VStack(alignment: .leading, spacing: 12) {
                    TextField("https://nero-rig.tailXXXX.ts.net", text: $draft)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.URL)
                        .submitLabel(.go)
                        .padding()
                        .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                        .foregroundStyle(.white)
                        .onSubmit(connect)

                    if let errorText {
                        Text(errorText)
                            .font(.footnote)
                            .foregroundStyle(.red.opacity(0.9))
                    }

                    Button(action: connect) {
                        HStack {
                            if checking { ProgressView().tint(.white) }
                            Text(checking ? "Connecting…" : "Connect")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(isValid ? Color.accentColor : Color.gray.opacity(0.4))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                    }
                    .disabled(!isValid || checking)
                }
                .padding(.horizontal, 24)
                Spacer()
            }
        }
    }

    private var isValid: Bool {
        NeroClient.normalize(draft) != nil
    }

    private func connect() {
        guard isValid, !checking else { return }
        checking = true
        errorText = nil
        Task {
            let ok = await NeroClient.checkHealth(baseURLString: draft)
            await MainActor.run {
                checking = false
                if ok {
                    serverURL = NeroClient.normalize(draft)?.absoluteString ?? draft
                } else {
                    errorText = "Could not reach a Nero server at that URL."
                }
            }
        }
    }
}
