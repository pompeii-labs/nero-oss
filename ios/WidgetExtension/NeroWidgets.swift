import SwiftUI
import WidgetKit

/// A small self-contained Nero orb (no dependency on the app's design system, so the
/// widget extension stays lean).
struct WidgetOrb: View {
    var size: CGFloat = 44
    var body: some View {
        ZStack {
            Circle().fill(
                RadialGradient(
                    colors: [
                        Color(red: 0.62, green: 0.95, blue: 1.0).opacity(0.95),
                        Color(red: 0.10, green: 0.48, blue: 0.70).opacity(0.25),
                    ],
                    center: .center, startRadius: 1, endRadius: size * 0.6
                )
            )
            Circle().strokeBorder(Color.cyan.opacity(0.35), lineWidth: 1)
        }
        .frame(width: size, height: size)
        .shadow(color: .cyan.opacity(0.5), radius: size * 0.18)
    }
}

struct NeroOrbEntry: TimelineEntry { let date: Date }

struct NeroOrbProvider: TimelineProvider {
    func placeholder(in context: Context) -> NeroOrbEntry { NeroOrbEntry(date: .now) }
    func getSnapshot(in context: Context, completion: @escaping (NeroOrbEntry) -> Void) {
        completion(NeroOrbEntry(date: .now))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<NeroOrbEntry>) -> Void) {
        completion(Timeline(entries: [NeroOrbEntry(date: .now)], policy: .never))
    }
}

/// Glanceable Nero on the lock screen, StandBy, and home screen. Tap opens the app.
struct NeroOrbView: View {
    @Environment(\.widgetFamily) private var family
    var entry: NeroOrbEntry

    var body: some View {
        switch family {
        case .accessoryCircular:
            WidgetOrb(size: 26).containerBackground(.clear, for: .widget)
        case .accessoryRectangular:
            HStack(spacing: 8) {
                WidgetOrb(size: 24)
                Text("Tell Nero").font(.system(.body, design: .rounded))
                Spacer()
            }
            .containerBackground(.clear, for: .widget)
        default:
            VStack(spacing: 8) {
                WidgetOrb(size: 54)
                Text("NERO").font(.system(.caption, design: .monospaced))
                    .tracking(2).foregroundStyle(.secondary)
            }
            .containerBackground(Color.black, for: .widget)
        }
    }
}

struct NeroOrbWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "NeroOrb", provider: NeroOrbProvider()) { entry in
            NeroOrbView(entry: entry).widgetURL(URL(string: "nero://open"))
        }
        .configurationDisplayName("Nero")
        .description("Glanceable Nero. Tap to open.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular, .systemSmall])
    }
}

@main
struct NeroWidgetBundle: WidgetBundle {
    var body: some Widget {
        NeroOrbWidget()
        NeroErrandLiveActivity()
    }
}
