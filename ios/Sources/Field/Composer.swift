import SwiftUI

/// The input dock as an iOS 26 Liquid Glass field: a tinted glass surface, a growing
/// text field, and a circular send (holo gradient) / stop (ember glass) control.
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
        HStack(alignment: .bottom, spacing: 8) {
            TextField("Message Nero", text: $draft, axis: .vertical)
                .font(Typeface.ui(15))
                .foregroundStyle(theme.text)
                .tint(theme.holo())
                .lineLimit(1...6)
                .focused(focused)
                .padding(.leading, 10)
                .padding(.vertical, 9)

            if busy {
                Button(action: onStop) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(theme.holo2())
                        .frame(width: 34, height: 34)
                        .background(theme.holo2(0.16), in: Circle())
                        .overlay(Circle().strokeBorder(theme.holo2(0.3)))
                }
                .buttonStyle(PressableButtonStyle())
            } else {
                Button(action: onSend) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(theme.void_)
                        .frame(width: 34, height: 34)
                        .background(
                            LinearGradient(colors: [theme.holoSoft, theme.holo()], startPoint: .top, endPoint: .bottom),
                            in: Circle()
                        )
                        .shadow(color: theme.holo(canSend ? 0.55 : 0), radius: 8)
                        .opacity(canSend ? 1 : 0.35)
                }
                .buttonStyle(PressableButtonStyle())
                .disabled(!canSend)
            }
        }
        .padding(4)
        .glassEffect(.regular.tint(theme.holo(isFocused ? 0.10 : 0.05)), in: shape)
        .animation(.easeOut(duration: 0.2), value: isFocused)
    }

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 24, style: .continuous) }
}
