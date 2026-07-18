import SwiftUI

/// Dedicated full-screen voice page. Opens straight into a live session; the orb is
/// driven by the voice phase, with the live transcript below and an end control.
struct VoiceScreen: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: NeroStore
    @ObservedObject var voice: VoiceSession

    private var orbState: Orb.State {
        switch voice.phase {
        case .connecting, .thinking: return .thinking
        case .speaking: return .speaking
        default: return .idle
        }
    }
    private var hint: String {
        switch voice.phase {
        case .idle, .connecting: return "connecting…"
        case .listening: return "listening"
        case .thinking: return "thinking…"
        case .speaking: return "speaking"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                IconButton(system: "chevron.down", size: 40, iconSize: 17, circle: true) { close() }
                Spacer()
                Kicker(text: "voice", color: theme.textDim)
                Spacer()
                Color.clear.frame(width: 40, height: 40)
            }
            .padding(.horizontal, 16).padding(.top, 8)

            Spacer()

            if let a = voice.activity {
                HStack(spacing: 6) {
                    Circle().fill(theme.holoSoft).frame(width: 5, height: 5)
                    Text(a).font(Typeface.mono(11)).foregroundStyle(theme.textDim)
                }
                .padding(.horizontal, 12).padding(.vertical, 6)
                .background(theme.holo(0.06), in: Capsule())
                .overlay(Capsule().strokeBorder(theme.holo(0.18)))
                .padding(.bottom, 24)
            }

            Orb(state: orbState, size: 240)

            Group {
                if voice.transcript.isEmpty {
                    Text(voice.errorText ?? hint)
                        .font(Typeface.mono(12)).tracking(1)
                        .foregroundStyle(voice.errorText != nil ? theme.holo2() : theme.textFaint)
                } else {
                    Text(voice.transcript)
                        .font(Typeface.display(24)).foregroundStyle(theme.text)
                        .multilineTextAlignment(.center).lineLimit(4)
                }
            }
            .frame(maxWidth: 320, minHeight: 64)
            .padding(.top, 30)
            .animation(.easeInOut, value: voice.transcript)

            Spacer()

            Button { close() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundStyle(theme.holo2())
                    .frame(width: 66, height: 66)
                    .background(theme.holo2(0.1), in: Circle())
                    .overlay(Circle().strokeBorder(theme.holo2(0.3)))
            }
            .buttonStyle(PressableButtonStyle())
            .padding(.bottom, 34)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { Atmosphere() }
        .onAppear { voice.start() }
        .onDisappear { voice.stop() }
    }

    private func close() {
        voice.stop()
        dismiss()
    }
}
