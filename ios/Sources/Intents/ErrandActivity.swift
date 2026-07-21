import ActivityKit
import Foundation

/// Starts / ends the errand Live Activity (the Dynamic Island presence). Starting from a
/// background App Intent works on recent iOS; if the system declines (app fully
/// suspended), it fails quietly and the completion push still tells you it's done.
@available(iOS 16.2, *)
enum ErrandActivity {
    @discardableResult
    static func start(_ request: String) -> String? {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
        let short = request.count > 60 ? String(request.prefix(59)) + "…" : request
        let content = ActivityContent(
            state: NeroErrandActivity.ContentState(phase: "working", detail: "On it…"),
            staleDate: Date().addingTimeInterval(180)
        )
        return try? ActivityKit.Activity.request(
            attributes: NeroErrandActivity(request: short),
            content: content,
            pushType: nil
        ).id
    }

    /// Flip any running errand activities to a terminal state and let them auto-dismiss.
    static func finish(phase: String, detail: String) async {
        for a in ActivityKit.Activity<NeroErrandActivity>.activities {
            let content = ActivityContent(
                state: NeroErrandActivity.ContentState(phase: phase, detail: detail),
                staleDate: nil
            )
            await a.end(content, dismissalPolicy: .after(Date().addingTimeInterval(6)))
        }
    }

    static func endAll() async {
        for a in ActivityKit.Activity<NeroErrandActivity>.activities {
            await a.end(nil, dismissalPolicy: .immediate)
        }
    }
}
