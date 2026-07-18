import SwiftUI

@main
struct NeroApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                // Prompt for notifications + register the APNs token with Lux push.
                .task { appDelegate.requestPush() }
        }
    }
}
