import SwiftUI
import MarkdownUI

/// User = right-aligned Liquid Glass bubble; assistant = full markdown prose
/// (headings, code blocks, lists, blockquotes) via the Nero markdown theme.
struct MessageBubble: View {
    @Environment(\.theme) private var theme
    let role: String       // "user" | "assistant"
    let text: String

    var body: some View {
        HStack(spacing: 0) {
            if role == "user" { Spacer(minLength: 52) }
            content
            if role == "assistant" { Spacer(minLength: 24) }
        }
    }

    @ViewBuilder private var content: some View {
        if role == "user" {
            Text(text)
                .font(Typeface.ui(15))
                .foregroundStyle(theme.text)
                .padding(.horizontal, 15)
                .padding(.vertical, 10)
                .glassEffect(.regular.tint(theme.holo(0.16)), in: bubbleShape)
        } else {
            Markdown(text)
                .markdownTheme(.nero(theme))
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var bubbleShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(topLeadingRadius: 17, bottomLeadingRadius: 17, bottomTrailingRadius: 5, topTrailingRadius: 17, style: .continuous)
    }
}

extension MarkdownUI.Theme {
    /// Nero's Obsidian markdown theme: system prose, holo inline code + links, dark
    /// bordered code blocks, a holo rule on blockquotes.
    @MainActor
    static func nero(_ t: Theme) -> MarkdownUI.Theme {
        MarkdownUI.Theme()
            .text {
                FontFamilyVariant(.normal)
                FontSize(15)
                ForegroundColor(t.text.opacity(0.92))
            }
            .strong { FontWeight(.semibold) }
            .emphasis { FontStyle(.italic) }
            .link { ForegroundColor(t.holoSoft) }
            .code {
                FontFamily(.system(.monospaced))
                FontSize(.em(0.86))
                ForegroundColor(t.holoSoft)
                BackgroundColor(t.holo(0.10))
            }
            .heading1 { c in
                c.label
                    .markdownMargin(top: 14, bottom: 6)
                    .markdownTextStyle { FontWeight(.semibold); FontSize(21); ForegroundColor(t.text) }
            }
            .heading2 { c in
                c.label
                    .markdownMargin(top: 12, bottom: 5)
                    .markdownTextStyle { FontWeight(.semibold); FontSize(18); ForegroundColor(t.text) }
            }
            .heading3 { c in
                c.label
                    .markdownMargin(top: 10, bottom: 4)
                    .markdownTextStyle { FontWeight(.semibold); FontSize(15.5); ForegroundColor(t.text) }
            }
            .paragraph { c in
                c.label
                    .lineSpacing(3)
                    .markdownMargin(top: 0, bottom: 10)
            }
            .listItem { c in
                c.label.markdownMargin(top: 2, bottom: 2)
            }
            .codeBlock { c in
                ScrollView(.horizontal, showsIndicators: false) {
                    c.label
                        .markdownTextStyle { FontFamily(.system(.monospaced)); FontSize(13); ForegroundColor(t.text) }
                        .padding(12)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.black.opacity(0.3), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(t.holo(0.14)))
                .markdownMargin(top: 6, bottom: 10)
            }
            .blockquote { c in
                c.label
                    .padding(.leading, 12)
                    .foregroundStyle(t.textDim)
                    .overlay(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 1).fill(t.holo(0.45)).frame(width: 2)
                    }
                    .markdownMargin(top: 6, bottom: 10)
            }
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
