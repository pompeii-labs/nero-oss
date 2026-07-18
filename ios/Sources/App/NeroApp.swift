import SwiftUI

@main
struct NeroApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                // Prompt for notifications + register the APNs token with Lux push,
                // and start reporting foreground presence.
                .task {
                    appDelegate.requestPush()
                    PresenceReporter.shared.setActive(true)
                }
                .onChange(of: scenePhase) { _, phase in
                    PresenceReporter.shared.setActive(phase == .active)
                }
        }
    }
}
