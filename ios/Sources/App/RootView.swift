import SwiftUI

/// Onboarding until a server URL is set, then the Field. `.id(serverURL)` rebuilds
/// the store (and its realtime connection) when the server changes.
struct RootView: View {
    @AppStorage(NeroConfig.serverKey) private var serverURL: String = NeroConfig.defaultURL
    @AppStorage("nero.theme") private var themeId: String = "vector"

    var body: some View {
        Group {
            if let base = URL(string: serverURL), !serverURL.isEmpty {
                FieldView(base: base)
                    .id(serverURL)
            } else {
                OnboardingView()
            }
        }
        .environment(\.theme, Theme.named(themeId))
        .tint(Theme.named(themeId).holo())
    }
}
