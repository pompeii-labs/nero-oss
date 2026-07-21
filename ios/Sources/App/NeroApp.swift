import SwiftUI

@main
struct NeroApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var scenePhase

    init() {
        // Publish the server URL into the shared App Group so the Share sheet, widgets,
        // and Live Activity can reach Nero without their own onboarding.
        NeroConfig.primeSharedDefaults()
    }

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
                    // Opening the app clears any lingering errand Live Activity.
                    if phase == .active, #available(iOS 16.2, *) {
                        Task { await ErrandActivity.endAll() }
                    }
                }
        }
    }
}
