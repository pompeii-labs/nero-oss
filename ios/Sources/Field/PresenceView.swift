import SwiftUI

/// Voice / presence mode: the orb centered and large, driven by the live voice
/// session. Tap the orb to start/stop talking; live transcript below, activity chip
/// above, a state hint. Chevron dismisses.
struct PresenceView: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: NeroStore
    let base: URL
    @StateObject private var voice: VoiceSession

    init(store: NeroStore, base: URL) {
        self.store = store
        self.base = base
        _voice = StateObject(wrappedValue: VoiceSession(base: base))
    }

    private var orbState: Orb.State {
        switch voice.phase {
        case .idle, .listening: return .idle
        case .connecting, .thinking: return .thinking
        case .speaking: return .speaking
        }
    }
    private var engaged: Bool { voice.phase != .idle }

    private var hint: String {
        switch voice.phase {
        case .idle: return "tap to talk"
        case .connecting: return "connecting…"
        case .listening: return "listening"
        case .thinking: return "thinking…"
        case .speaking: return "speaking"
        }
    }

    var body: some View {
        ZStack {
            Atmosphere()

            VStack(spacing: 30) {
                if let a = voice.activity {
                    HStack(spacing: 6) {
                        Circle().fill(theme.holoSoft).frame(width: 5, height: 5)
                        Text(a).font(Typeface.mono(11)).foregroundStyle(theme.textDim)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(theme.holo(0.06), in: Capsule())
                    .overlay(Capsule().strokeBorder(theme.holo(0.18)))
                    .transition(.opacity)
                }

                Button { engaged ? voice.stop() : voice.start() } label: {
                    Orb(state: orbState, size: 240)
                }
                .buttonStyle(.plain)

                Group {
                    if voice.transcript.isEmpty {
                        Text(voice.errorText ?? hint)
                            .font(Typeface.mono(12))
                            .foregroundStyle(voice.errorText != nil ? theme.holo2() : theme.textFaint)
                    } else {
                        Text(voice.transcript)
                            .font(Typeface.display(22))
                            .foregroundStyle(theme.text)
                            .multilineTextAlignment(.center)
                            .lineLimit(3)
                    }
                }
                .frame(maxWidth: 320)
                .animation(.easeInOut, value: voice.transcript)
            }
            .padding()

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
            .padding(.horizontal, 8)
            .padding(.top, 8)
        }
        .onDisappear { voice.stop() }
    }
}
