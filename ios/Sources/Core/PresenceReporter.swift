import Foundation

/// Pings the server's foreground heartbeat while the app is active, so Nero suppresses
/// push while you're on-screen. Stops when backgrounded; the server-side key TTLs out
/// and you're "away" within a heartbeat interval.
final class PresenceReporter {
    static let shared = PresenceReporter()
    private var task: Task<Void, Never>?
    private init() {}

    func setActive(_ active: Bool) {
        task?.cancel()
        task = nil
        guard active, let base = NeroConfig.serverURL else { return }
        let client = NeroClient(base: base)
        task = Task {
            while !Task.isCancelled {
                await client.heartbeat()
                try? await Task.sleep(nanoseconds: 20_000_000_000)
            }
        }
    }
}
