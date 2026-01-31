import SwiftUI

@main
struct NeroApp: App {
    @StateObject private var neroManager = NeroManager.shared
    @StateObject private var apiManager = APIManager.shared
    @StateObject private var voiceManager = VoiceManager.shared
    @StateObject private var toastManager = ToastManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(neroManager)
                .environmentObject(apiManager)
                .environmentObject(voiceManager)
                .environmentObject(toastManager)
                .preferredColorScheme(.dark)
        }
    }
}
