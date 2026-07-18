import SwiftUI

/// Native voice screen: an orb reflecting turn state, a live transcript, and a
/// big mic button to start/stop the session.
struct VoiceView: View {
    let baseURL: URL
    @StateObject private var session: VoiceSession
    @Environment(\.dismiss) private var dismiss

    init(baseURL: URL) {
        self.baseURL = baseURL
        _session = StateObject(wrappedValue: VoiceSession(baseURL: baseURL))
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            VStack(spacing: 32) {
                HStack {
                    Spacer()
                    Button {
                        session.stop()
                        dismiss()
                    } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundStyle(.white.opacity(0.7))
                            .padding(10)
                            .background(.white.opacity(0.08), in: Circle())
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 12)

                Spacer()

                Orb(state: session.state)

                Text(stateLabel)
                    .font(.headline)
                    .foregroundStyle(.white.opacity(0.8))

                if !session.transcript.isEmpty {
                    Text(session.transcript)
                        .font(.title3)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 32)
                        .transition(.opacity)
                }

                if let error = session.errorMessage {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red.opacity(0.9))
                        .padding(.horizontal, 32)
                }

                Spacer()

                Button(action: session.toggle) {
                    Image(systemName: session.isActive ? "stop.fill" : "mic.fill")
                        .font(.system(size: 30, weight: .bold))
                        .foregroundStyle(.black)
                        .frame(width: 84, height: 84)
                        .background(session.isActive ? Color.red : Color.white, in: Circle())
                }
                .padding(.bottom, 48)
            }
        }
        .onAppear { session.start() }
        .onDisappear { session.stop() }
    }

    private var stateLabel: String {
        switch session.state {
        case .idle: return "Tap to talk"
        case .connecting: return "Connecting…"
        case .thinking: return "Thinking…"
        case .listening: return "Listening"
        case .speaking: return "Speaking"
        }
    }
}

/// A pulsing orb whose look tracks the voice state.
struct Orb: View {
    let state: VoiceSession.State
    @State private var pulse = false

    var body: some View {
        ZStack {
            Circle()
                .fill(color.opacity(0.25))
                .frame(width: 220, height: 220)
                .scaleEffect(pulse ? 1.08 : 0.92)
            Circle()
                .fill(color.opacity(0.6))
                .frame(width: 140, height: 140)
                .scaleEffect(pulse ? 1.05 : 0.95)
            Circle()
                .fill(color)
                .frame(width: 80, height: 80)
        }
        .shadow(color: color.opacity(0.6), radius: 40)
        .onAppear {
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }

    private var color: Color {
        switch state {
        case .idle, .connecting: return .gray
        case .thinking: return .purple
        case .listening: return .blue
        case .speaking: return .green
        }
    }
}
