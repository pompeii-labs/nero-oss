import SwiftUI

struct ContentView: View {
    @AppStorage(PushRegistration.serverURLKey) private var serverURL: String = ""

    @State private var showOnboarding = false
    @State private var reloadTrigger = 0
    @State private var navigateURL: URL?

    private var resolvedURL: URL? {
        let trimmed = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return URL(string: trimmed)
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if let url = resolvedURL, !showOnboarding {
                WebView(url: url, reloadTrigger: $reloadTrigger, navigateURL: $navigateURL)
                    .ignoresSafeArea()
                    .overlay(alignment: .topTrailing) {
                        Button {
                            showOnboarding = true
                        } label: {
                            Image(systemName: "gearshape.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.white.opacity(0.7))
                                .padding(10)
                                .background(.ultraThinMaterial, in: Circle())
                        }
                        .padding(.top, 8)
                        .padding(.trailing, 12)
                    }
            } else {
                OnboardingView(serverURL: $serverURL) {
                    showOnboarding = false
                    reloadTrigger += 1
                    PushRegistration.reregister()
                }
            }
        }
        .onAppear {
            if resolvedURL == nil {
                showOnboarding = true
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .neroOpenURL)) { note in
            if let url = note.object as? URL {
                showOnboarding = false
                navigateURL = url
            }
        }
    }
}

struct OnboardingView: View {
    @Binding var serverURL: String
    var onConnect: () -> Void

    @State private var draft: String = ""

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            VStack(spacing: 8) {
                Text("Nero")
                    .font(.system(size: 40, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                Text("Connect to your Nero server")
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.6))
            }

            VStack(alignment: .leading, spacing: 12) {
                TextField(
                    "https://nero-rig.tailXXXX.ts.net",
                    text: $draft
                )
                .textFieldStyle(.plain)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled(true)
                .keyboardType(.URL)
                .submitLabel(.go)
                .padding()
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                .foregroundStyle(.white)
                .onSubmit(connect)

                Button(action: connect) {
                    Text("Connect")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(isValid ? Color.accentColor : Color.gray.opacity(0.4))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(!isValid)
            }
            .padding(.horizontal, 24)

            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.ignoresSafeArea())
        .onAppear {
            draft = serverURL
        }
    }

    private var isValid: Bool {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), let scheme = url.scheme else { return false }
        return (scheme == "http" || scheme == "https") && url.host != nil
    }

    private func connect() {
        guard isValid else { return }
        serverURL = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        onConnect()
    }
}
