import SwiftUI

/// First-run: point the app at your Nero (Tailscale URL or LAN IP), validated via
/// the health endpoint. On success the URL is stored and RootView swaps to the Field.
struct OnboardingView: View {
    @Environment(\.theme) private var theme
    @AppStorage(NeroConfig.serverKey) private var serverURL: String = ""
    @State private var input = ""
    @State private var checking = false
    @State private var failed = false

    var body: some View {
        ZStack {
            Atmosphere()
            VStack(spacing: 22) {
                Text("NERO")
                    .font(Typeface.display(54))
                    .tracking(8)
                    .foregroundStyle(theme.text)
                    .shadow(color: theme.holo(0.35), radius: 24)
                Text("Connect to your Nero")
                    .font(Typeface.ui(15))
                    .foregroundStyle(theme.textDim)

                VStack(spacing: 12) {
                    TextField("your-nero.ts.net", text: $input)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(.URL)
                        .font(Typeface.mono(14))
                        .foregroundStyle(theme.text)
                        .padding(14)
                        .glass(radius: 14)
                        .onSubmit(connect)

                    if failed {
                        Text("Couldn't reach Nero there.")
                            .font(Typeface.mono(12))
                            .foregroundStyle(theme.holo2())
                    }

                    Button(action: connect) {
                        Text(checking ? "Connecting…" : "Connect")
                            .font(Typeface.mono(13)).tracking(1)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(theme.holo(0.16), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(theme.holo(0.32)))
                            .foregroundStyle(theme.holoSoft)
                    }
                    .disabled(checking || input.isEmpty)
                }
                .frame(maxWidth: 340)
            }
            .padding(28)
        }
    }

    private func connect() {
        guard let url = normalized(input), let base = URL(string: url) else { return }
        checking = true
        failed = false
        Task {
            let ok = await NeroClient.health(base)
            await MainActor.run {
                checking = false
                if ok { serverURL = url } else { failed = true }
            }
        }
    }

    private func normalized(_ s: String) -> String? {
        var t = s.trimmingCharacters(in: .whitespaces)
        guard !t.isEmpty else { return nil }
        if !t.hasPrefix("http://") && !t.hasPrefix("https://") { t = "https://" + t }
        return t
    }
}
