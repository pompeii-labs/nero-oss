import SwiftUI

/// The input dock: mono prompt, growing text field, send/stop.
struct Composer: View {
    @Environment(\.theme) private var theme
    @Binding var draft: String
    var busy: Bool
    var onSend: () -> Void
    var onStop: () -> Void

    private var canSend: Bool { !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            Text("›")
                .font(Typeface.mono(16))
                .foregroundStyle(theme.holo(0.7))
                .padding(.bottom, 2)

            TextField("Message Nero", text: $draft, axis: .vertical)
                .font(Typeface.ui(15))
                .foregroundStyle(theme.text)
                .lineLimit(1...6)
                .tint(theme.holo())

            if busy {
                Button(action: onStop) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(theme.holo2())
                        .frame(width: 32, height: 32)
                        .background(theme.holo2(0.12), in: Circle())
                }
            } else {
                Button(action: onSend) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 15, weight: .bold))
                        .foregroundStyle(canSend ? theme.void_ : theme.textFaint)
                        .frame(width: 32, height: 32)
                        .background(canSend ? theme.holo() : theme.holo(0.12), in: Circle())
                }
                .disabled(!canSend)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .glass(radius: 18, strokeAlpha: 0.24)
    }
}
