import SwiftUI

/// Voice / presence mode. Placeholder for now (orb centered); the live voice session
/// (WS + AVFoundation) lands in the voice milestone.
struct PresenceView: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: NeroStore
    let base: URL

    var body: some View {
        ZStack {
            Atmosphere()
            VStack(spacing: 22) {
                Orb(state: .idle, size: 220)
                Text("voice coming soon")
                    .font(Typeface.mono(12))
                    .foregroundStyle(theme.textFaint)
            }
            VStack {
                HStack {
                    Spacer()
                    Button { dismiss() } label: {
                        Image(systemName: "chevron.down")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(theme.textDim)
                            .frame(width: 40, height: 40)
                    }
                }
                Spacer()
            }
            .padding()
        }
    }
}
