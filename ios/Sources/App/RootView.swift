import SwiftUI
import UIKit

/// Onboarding until a server URL is set, then the Field. `.id(serverURL)` rebuilds
/// the store (and its realtime connection) when the server changes.
struct RootView: View {
    @AppStorage(NeroConfig.serverKey) private var serverURL: String = NeroConfig.defaultURL
    @AppStorage("nero.theme") private var themeId: String = "obsidian"

    var body: some View {
        Group {
            if let base = URL(string: serverURL), !serverURL.isEmpty {
                FieldView(base: base)
                    .id(serverURL)
                    // Prompt for notifications + register the APNs token with Lux push
                    // once we have a server to register against.
                    .task { (UIApplication.shared.delegate as? AppDelegate)?.requestPush() }
            } else {
                OnboardingView()
            }
        }
        .environment(\.theme, Theme.named(themeId))
        .tint(Theme.named(themeId).holo())
    }
}
