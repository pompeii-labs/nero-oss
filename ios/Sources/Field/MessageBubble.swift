import SwiftUI
import MarkdownUI

/// User = right-aligned Liquid Glass bubble; assistant = full markdown prose
/// (headings, code blocks, lists, blockquotes) via the Nero markdown theme.
struct MessageBubble: View {
    @Environment(\.theme) private var theme
    let role: String       // "user" | "assistant"
    let text: String
    var images: [Attachment] = []
    var base: URL?

    private var isUser: Bool { role == "user" }

    var body: some View {
        HStack(spacing: 0) {
            if isUser { Spacer(minLength: 52) }
            VStack(alignment: isUser ? .trailing : .leading, spacing: 7) {
                if !images.isEmpty { imageStack }
                if !text.isEmpty { content }
            }
            if !isUser { Spacer(minLength: 24) }
        }
    }

    private var imageStack: some View {
        VStack(alignment: isUser ? .trailing : .leading, spacing: 6) {
            ForEach(images) { img in
                AsyncImage(url: fileURL(img.id)) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFit()
                    case .failure:
                        placeholder(icon: "photo")
                    default:
                        placeholder(icon: nil)
                    }
                }
                .frame(maxWidth: 240, maxHeight: 300)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(theme.holo(0.18)))
            }
        }
    }

    private func placeholder(icon: String?) -> some View {
        RoundedRectangle(cornerRadius: 14, style: .continuous)
            .fill(theme.holo(0.06))
            .frame(width: 200, height: 150)
            .overlay {
                if let icon { Image(systemName: icon).font(.system(size: 22)).foregroundStyle(theme.textFaint) }
                else { ProgressView().tint(theme.holoSoft) }
            }
    }

    private func fileURL(_ id: String) -> URL? {
        guard let base else { return nil }
        return URL(string: "/v1/files/\(id)", relativeTo: base)
    }

    @ViewBuilder private var content: some View {
        if isUser {
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

/// Nero's tool activity for a turn: a holo card with a status dot + name per step,
/// each expandable to its result (mirrors the web ToolGroup). `live` brightens it.
struct ToolGroup: View {
    @Environment(\.theme) private var theme
    let activities: [Activity]
    var live = false
    @State private var open: Set<String> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if activities.count > 1 {
                Text("\(activities.count) steps")
                    .font(Typeface.mono(9.5)).tracking(1.6).textCase(.uppercase)
                    .foregroundStyle(theme.textFaint)
                    .padding(.horizontal, 9).padding(.top, 5).padding(.bottom, 6)
            }
            ForEach(activities) { a in
                Button { if a.result != nil { toggle(a.id) } } label: {
                    HStack(spacing: 10) {
                        Circle().fill(dot(a.status)).frame(width: 6, height: 6)
                            .shadow(color: dot(a.status).opacity(0.7), radius: a.status == "running" ? 5 : 3)
                        Text(a.displayName ?? a.tool ?? "tool")
                            .font(Typeface.mono(12)).foregroundStyle(theme.textDim).lineLimit(1)
                        Spacer(minLength: 4)
                        if a.result != nil {
                            Image(systemName: "chevron.right").font(.system(size: 9, weight: .semibold))
                                .foregroundStyle(theme.textFaint)
                                .rotationEffect(.degrees(open.contains(a.id) ? 90 : 0))
                        }
                    }
                    .padding(.horizontal, 9).padding(.vertical, 7)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                if let r = a.result, open.contains(a.id) {
                    Text(r)
                        .font(Typeface.mono(11)).foregroundStyle(theme.textDim)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(10)
                        .background(Color.black.opacity(0.35), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                        .padding(.horizontal, 9).padding(.bottom, 6)
                }
            }
        }
        .frame(minWidth: 220, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .padding(6)
        .background(theme.holo(live ? 0.05 : 0.03), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(theme.holo(live ? 0.22 : 0.1)))
    }

    private func toggle(_ id: String) {
        if open.contains(id) { open.remove(id) } else { open.insert(id) }
    }
    private func dot(_ status: String?) -> Color {
        switch status {
        case "success", "complete": return theme.holo()
        case "error": return Color(hex: 0xf87171)
        default: return theme.holoSoft
        }
    }
}
