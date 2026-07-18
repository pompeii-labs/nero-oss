import Foundation

/// POSTs the APNs device token to Nero once we know the server. Fire-and-forget.
enum PushRegistration {
    static func register(token: String) {
        guard let base = NeroConfig.serverURL else { return }
        Task { await NeroClient(base: base).registerPush(token) }
    }
}
