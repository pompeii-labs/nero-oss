import SwiftUI

/// User = right-aligned glass bubble; assistant = left-aligned markdown prose.
struct MessageBubble: View {
    @Environment(\.theme) private var theme
    let role: String       // "user" | "assistant"
    let text: String

    var body: some View {
        HStack(spacing: 0) {
            if role == "user" { Spacer(minLength: 44) }
            content
            if role == "assistant" { Spacer(minLength: 44) }
        }
    }

    @ViewBuilder private var content: some View {
        if role == "user" {
            Text(text)
                .font(Typeface.ui(15))
                .foregroundStyle(theme.text)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(theme.holo(0.08), in: bubbleShape)
                .overlay(bubbleShape.strokeBorder(theme.holo(0.22)))
        } else {
            Text(markdown(text))
                .font(Typeface.ui(15))
                .foregroundStyle(theme.text.opacity(0.92))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineSpacing(3)
        }
    }

    private var bubbleShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(topLeadingRadius: 16, bottomLeadingRadius: 16, bottomTrailingRadius: 4, topTrailingRadius: 16, style: .continuous)
    }

    private func markdown(_ s: String) -> AttributedString {
        (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)))
            ?? AttributedString(s)
    }
}

/// A collapsed row of Nero's tool activity for the in-flight turn.
struct ToolGroup: View {
    @Environment(\.theme) private var theme
    let activities: [Activity]

    var body: some View {
        HStack(spacing: 8) {
            ForEach(activities.suffix(4)) { a in
                HStack(spacing: 5) {
                    Circle()
                        .fill(color(a.status))
                        .frame(width: 5, height: 5)
                    Text(a.displayName ?? a.tool ?? "tool")
                        .font(Typeface.mono(10))
                        .foregroundStyle(theme.textDim)
                        .lineLimit(1)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(theme.holo(0.05), in: Capsule())
                .overlay(Capsule().strokeBorder(theme.holo(0.15)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func color(_ status: String?) -> Color {
        switch status {
        case "success": return theme.holo()
        case "error": return theme.holo2()
        default: return theme.holoSoft
        }
    }
}
