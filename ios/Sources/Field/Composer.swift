import SwiftUI

/// The input dock, faithful to web Composer.svelte: a glass slab (radius 16, the
/// 3-part shadow, holo border that brightens on focus), a `›` mono prompt, a growing
/// field, and 34×34 rounded-square buttons (holo-gradient send / soft-holo stop).
struct Composer: View {
    @Environment(\.theme) private var theme
    @Binding var draft: String
    var busy: Bool
    var focused: FocusState<Bool>.Binding
    var onSend: () -> Void
    var onStop: () -> Void

    private var canSend: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var isFocused: Bool { focused.wrappedValue }

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            Text("›")
                .font(Typeface.mono(15))
                .foregroundStyle(theme.holo())
                .padding(.bottom, 8)

            TextField("Message Nero", text: $draft, axis: .vertical)
                .font(Typeface.ui(14))
                .foregroundStyle(theme.text)
                .tint(theme.holo())
                .lineLimit(1...6)
                .focused(focused)
                .padding(.vertical, 6)

            if busy {
                squareButton(icon: "square.fill", iconSize: 13, fg: theme.text, bg: theme.holo(0.12), glow: false, action: onStop)
            } else {
                Button(action: onSend) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(theme.void_)
                        .frame(width: 34, height: 34)
                        .background(
                            LinearGradient(colors: [theme.holoSoft, theme.holo()], startPoint: .top, endPoint: .bottom),
                            in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                        )
                        .shadow(color: theme.holo(canSend ? 0.6 : 0), radius: 8)
                        .opacity(canSend ? 1 : 0.4)
                }
                .buttonStyle(PressableButtonStyle())
                .disabled(!canSend)
            }
        }
        .padding(.leading, 16).padding(.trailing, 10).padding(.vertical, 10)
        .slab(focused: isFocused)
    }

    private func squareButton(icon: String, iconSize: CGFloat, fg: Color, bg: Color, glow: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: icon)
                .font(.system(size: iconSize, weight: .medium))
                .foregroundStyle(fg)
                .frame(width: 34, height: 34)
                .background(bg, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(PressableButtonStyle())
    }
}
