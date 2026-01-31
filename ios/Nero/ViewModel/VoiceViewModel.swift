import SwiftUI

@MainActor
class VoiceViewModel: ObservableObject {
    @Published var isConnected = false

    func connect() async {
        await VoiceManager.shared.connect()
        isConnected = VoiceManager.shared.status != .idle && VoiceManager.shared.status != .error("")
    }

    func disconnect() {
        VoiceManager.shared.disconnect()
        isConnected = false
    }

    func toggleMute() {
        VoiceManager.shared.toggleMute()
    }
}
