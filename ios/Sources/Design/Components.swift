import SwiftUI
import UIKit

/// Scale + light haptic on press. Apply to every tappable (mirrors Pompeii's
/// PressableButtonStyle) for a consistent tactile feel.
struct PressableButtonStyle: ButtonStyle {
    var haptic = true
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
            .onChange(of: configuration.isPressed) { _, pressed in
                if pressed && haptic { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
            }
    }
}

/// The signature mono uppercase micro-label with real letter-spacing (missing the
/// tracking is what makes labels look off). Used for section kickers + metadata.
struct Kicker: View {
    @Environment(\.theme) private var theme
    let text: String
    var size: CGFloat = 11
    var color: Color?
    var body: some View {
        Text(text.uppercased())
            .font(Typeface.mono(size))
            .tracking(1.4)
            .foregroundStyle(color ?? theme.textFaint)
    }
}

/// The canonical "ghost-holo" pill button (settings save/add/connect/disconnect).
struct GhostPill: View {
    @Environment(\.theme) private var theme
    let title: String
    var destructive = false
    var disabled = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Typeface.mono(11)).tracking(0.4)
                .foregroundStyle(destructive ? theme.holo2() : theme.holoSoft)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background((destructive ? theme.holo2(0.1) : theme.holo(0.1)),
                            in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous)
                    .strokeBorder(destructive ? theme.holo2(0.28) : theme.holo(0.28)))
        }
        .buttonStyle(PressableButtonStyle())
        .disabled(disabled)
        .opacity(disabled ? 0.5 : 1)
    }
}

/// Mono capsule status pill: "SET" / "N TOOLS" (on), "NEEDS VALUE" (warn), etc.
struct StatusPill: View {
    enum Tone { case on, warn, neutral }
    @Environment(\.theme) private var theme
    let text: String
    var tone: Tone = .neutral
    var body: some View {
        let fg: Color = tone == .on ? theme.holoSoft : tone == .warn ? theme.holo2() : theme.textFaint
        let border: Color = tone == .on ? theme.holo(0.4) : tone == .warn ? theme.holo2(0.4) : theme.holo(0.15)
        return Text(text.uppercased())
            .font(Typeface.mono(9)).tracking(1)
            .foregroundStyle(fg)
            .padding(.horizontal, 8).padding(.vertical, 2.5)
            .overlay(Capsule().strokeBorder(border))
    }
}

/// A ghost icon button (square by default; circle for bar/voice controls).
struct IconButton: View {
    @Environment(\.theme) private var theme
    let system: String
    var size: CGFloat = 34
    var iconSize: CGFloat = 15
    var radius: CGFloat = 10
    var circle = false
    var tint: Color?
    var filled = false
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: iconSize, weight: .medium))
                .foregroundStyle(tint ?? theme.textDim)
                .frame(width: size, height: size)
                .background(background)
        }
        .buttonStyle(PressableButtonStyle(haptic: false))
    }

    @ViewBuilder private var background: some View {
        if filled {
            if circle {
                Circle().fill(theme.holo(0.05)).overlay(Circle().strokeBorder(theme.holo(0.18)))
            } else {
                let s = RoundedRectangle(cornerRadius: radius, style: .continuous)
                s.fill(theme.holo(0.05)).overlay(s.strokeBorder(theme.holo(0.18)))
            }
        }
    }
}

/// The Nero settings surface: a mono kicker over a rounded holo-tinted card whose
/// rows are separated by inset hairlines (no divider on the first row).
struct SettingsSection<Content: View>: View {
    @Environment(\.theme) private var theme
    let title: String
    @ViewBuilder let content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Kicker(text: title).padding(.leading, 4)
            VStack(spacing: 0) { content }
                .background(theme.holo(0.02), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(theme.holo(0.1)))
        }
    }
}

/// A row inside a SettingsSection with a leading inset hairline (hidden on the first).
struct SettingsRow<Content: View>: View {
    @Environment(\.theme) private var theme
    let first: Bool
    @ViewBuilder let content: Content
    var body: some View {
        content
            .padding(.horizontal, 14).padding(.vertical, 12)
            .overlay(alignment: .top) {
                if !first {
                    Rectangle().fill(theme.holo(0.08)).frame(height: 1).padding(.leading, 14)
                }
            }
    }
}

/// The composer glass slab (web Composer.svelte): material + panel gradient + a
/// black top-to-bottom overlay + inset top highlight + holo border + 3-part shadow.
struct SlabBackground: ViewModifier {
    @Environment(\.theme) private var theme
    var focused = false
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
        content.background {
            shape
                .fill(.ultraThinMaterial)
                .overlay { LinearGradient(colors: theme.panelStops, startPoint: .topLeading, endPoint: .bottomTrailing).clipShape(shape) }
                .overlay { LinearGradient(colors: [.clear, .black.opacity(0.32)], startPoint: .top, endPoint: .bottom).clipShape(shape) }
                .overlay(alignment: .top) {
                    Rectangle()
                        .fill(LinearGradient(colors: [theme.holoSoft.opacity(0.16), .clear], startPoint: .top, endPoint: .bottom))
                        .frame(height: 12).clipShape(shape).allowsHitTesting(false)
                }
                .overlay { shape.strokeBorder(theme.holo(focused ? 0.42 : 0.2), lineWidth: 1) }
                .shadow(color: theme.holo(focused ? 0.34 : 0.22), radius: focused ? 26 : 20)
                .shadow(color: .black.opacity(0.9), radius: 20, y: 18)
                .animation(.easeOut(duration: 0.25), value: focused)
        }
    }
}
extension View {
    func slab(focused: Bool = false) -> some View { modifier(SlabBackground(focused: focused)) }
}

/// The Nero-styled text field used in settings (dark inset, holo focus border, mono).
struct NeroField: View {
    @Environment(\.theme) private var theme
    let placeholder: String
    @Binding var text: String
    var secure = false
    @FocusState private var focused: Bool
    var body: some View {
        Group {
            if secure { SecureField(placeholder, text: $text) }
            else { TextField(placeholder, text: $text) }
        }
        .font(Typeface.mono(12))
        .foregroundStyle(theme.text)
        .tint(theme.holo())
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .focused($focused)
        .padding(.horizontal, 10).padding(.vertical, 8)
        .background(Color.black.opacity(0.25), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous)
            .strokeBorder(theme.holo(focused ? 0.4 : 0.14)))
    }
}
