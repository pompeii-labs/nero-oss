import ActivityKit
import SwiftUI
import WidgetKit

/// The Dynamic Island + lock-screen presence while Nero works an errand.
struct NeroErrandLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: NeroErrandActivity.self) { context in
            // Lock screen / banner.
            HStack(spacing: 12) {
                WidgetOrb(size: 34)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.request)
                        .font(.subheadline).lineLimit(1).foregroundStyle(.white)
                    Text(statusLine(context.state))
                        .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.6))
            .activitySystemActionForegroundColor(.cyan)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) { WidgetOrb(size: 30) }
                DynamicIslandExpandedRegion(.trailing) { phaseIcon(context.state.phase) }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.attributes.request).font(.footnote).lineLimit(1)
                        Text(statusLine(context.state))
                            .font(.caption2).foregroundStyle(.secondary).lineLimit(2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                WidgetOrb(size: 18)
            } compactTrailing: {
                phaseIcon(context.state.phase)
            } minimal: {
                WidgetOrb(size: 18)
            }
        }
    }

    private func statusLine(_ s: NeroErrandActivity.ContentState) -> String {
        switch s.phase {
        case "done": return s.detail.isEmpty ? "Done" : s.detail
        case "error": return "Something went wrong"
        default: return s.detail.isEmpty ? "On it…" : s.detail
        }
    }

    @ViewBuilder private func phaseIcon(_ phase: String) -> some View {
        switch phase {
        case "done": Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
        case "error": Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
        default: Image(systemName: "ellipsis").foregroundStyle(.cyan)
        }
    }
}
