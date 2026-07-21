import ActivityKit

/// The Live Activity for a Nero errand: shown in the Dynamic Island / on the lock screen
/// while he works a one-off request. Shared by the app (which starts/updates/ends it)
/// and the widget extension (which renders it).
struct NeroErrandActivity: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// "working" | "done" | "error"
        var phase: String
        /// Current tool while working, or the short result when done.
        var detail: String
    }

    /// The errand text, fixed for the life of the activity.
    var request: String
}
