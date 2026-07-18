import SwiftUI

/// Renders one node of a panel's declarative component tree. Mirrors the web
/// reference renderer (web/src/lib/components/field/PanelComponent.svelte). Bindings
/// resolve against the panel `state`; `onAction` carries button interactions back.
struct PanelComponentView: View {
    @Environment(\.theme) private var theme
    let comp: Comp
    let state: [String: JSONValue]
    let onAction: (PanelAction, String) -> Void

    var body: some View {
        switch comp.type {
        case "text": textView
        case "button": buttonView
        case "metric": metricView
        case "list": listView
        case "badge": badgeView
        case "progress": progressView
        case "divider": Rectangle().fill(theme.holo(0.15)).frame(height: 1)
        case "image": imageView
        case "chart": ChartView(comp: comp, state: state)
        case "row": rowView
        case "stack": stackView
        case "browser": embed(icon: "globe", label: "Live browser")
        case "youtube": embed(icon: "play.rectangle.fill", label: "YouTube")
        default: EmptyView()
        }
    }

    private func s(_ b: Bound?) -> String { b?.string(state) ?? "" }

    // MARK: leaves
    private var textView: some View {
        let variant = comp.variant ?? "body"
        return Text(s(comp.text))
            .font(textFont(variant))
            .foregroundStyle(variant == "caption" ? theme.textFaint : theme.text)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
    private func textFont(_ v: String) -> Font {
        switch v {
        case "title": return Typeface.display(24)
        case "heading": return Typeface.ui(17, .semibold)
        case "caption": return Typeface.mono(11)
        case "mono": return Typeface.mono(13)
        default: return Typeface.ui(14)
        }
    }

    private var buttonView: some View {
        let variant = comp.variant ?? "default"
        let label = s(comp.label)
        return Button {
            if let a = comp.action { onAction(a, label) }
        } label: {
            Text(label)
                .font(Typeface.mono(12)).tracking(0.4)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .frame(maxWidth: variant == "primary" ? .infinity : nil)
        }
        .foregroundStyle(buttonFg(variant))
        .background(buttonBg(variant), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(buttonBorder(variant)))
    }
    private func buttonFg(_ v: String) -> Color {
        switch v { case "primary": return theme.void_; case "danger": return theme.holo2(); default: return theme.holoSoft }
    }
    private func buttonBg(_ v: String) -> Color {
        switch v { case "primary": return theme.holo(); case "ghost": return .clear; default: return theme.holo(0.1) }
    }
    private func buttonBorder(_ v: String) -> Color {
        switch v { case "danger": return theme.holo2(0.4); case "ghost": return theme.holo(0.18); default: return theme.holo(0.3) }
    }

    private var metricView: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(s(comp.label)).font(Typeface.mono(10)).foregroundStyle(theme.textFaint)
            Text(s(comp.value)).font(Typeface.display(28)).foregroundStyle(theme.text)
            if comp.sub != nil { Text(s(comp.sub)).font(Typeface.mono(11)).foregroundStyle(theme.textDim) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var listView: some View {
        let items = comp.items?.strings(state) ?? []
        return VStack(alignment: .leading, spacing: 5) {
            ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                HStack(alignment: .top, spacing: 8) {
                    Text(comp.ordered == true ? "\(i + 1)." : "•")
                        .font(Typeface.mono(12)).foregroundStyle(theme.holo(0.7))
                    Text(item).font(Typeface.ui(14)).foregroundStyle(theme.text)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var badgeView: some View {
        let tone = comp.tone ?? "info"
        let color: Color = tone == "good" ? theme.holo() : tone == "bad" ? theme.holo2() : tone == "warn" ? Color(hex: 0xf5a524) : theme.holoSoft
        return Text(s(comp.text))
            .font(Typeface.mono(10)).tracking(0.6)
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(color.opacity(0.14), in: Capsule())
            .overlay(Capsule().strokeBorder(color.opacity(0.4)))
            .foregroundStyle(color)
    }

    private var progressView: some View {
        let v = comp.value?.double(state) ?? 0
        let maxV = comp.maxVal ?? 100
        let frac = maxV > 0 ? min(1, max(0, v / maxV)) : 0
        return VStack(alignment: .leading, spacing: 4) {
            if comp.label != nil { Text(s(comp.label)).font(Typeface.mono(10)).foregroundStyle(theme.textFaint) }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(theme.holo(0.1))
                    Capsule().fill(theme.holo()).frame(width: geo.size.width * frac)
                }
            }
            .frame(height: 6)
        }
    }

    private var imageView: some View {
        AsyncImage(url: URL(string: s(comp.src))) { img in
            img.resizable().aspectRatio(contentMode: comp.fit == "contain" ? .fit : .fill)
        } placeholder: {
            Rectangle().fill(theme.holo(0.05))
        }
        .frame(height: comp.height ?? 160)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    // MARK: containers
    private var rowView: some View {
        HStack(alignment: align(comp.align), spacing: comp.gap ?? 8) {
            ForEach(Array((comp.children ?? []).enumerated()), id: \.offset) { _, child in
                PanelComponentView(comp: child, state: state, onAction: onAction)
            }
        }
    }
    private var stackView: some View {
        VStack(alignment: .leading, spacing: comp.gap ?? 8) {
            ForEach(Array((comp.children ?? []).enumerated()), id: \.offset) { _, child in
                PanelComponentView(comp: child, state: state, onAction: onAction)
            }
        }
    }
    private func align(_ a: String?) -> VerticalAlignment {
        switch a { case "center": return .center; case "end": return .bottom; default: return .top }
    }

    private func embed(icon: String, label: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon).foregroundStyle(theme.holoSoft)
            Text(label).font(Typeface.mono(12)).foregroundStyle(theme.textDim)
            Spacer()
            Image(systemName: "arrow.up.right").font(.system(size: 11)).foregroundStyle(theme.textFaint)
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(theme.holo(0.05), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(theme.holo(0.15)))
    }
}
