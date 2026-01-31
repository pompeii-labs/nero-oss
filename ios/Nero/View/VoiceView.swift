import SwiftUI

struct VoiceView: View {
    @Binding var showMenu: Bool

    @EnvironmentObject var voiceManager: VoiceManager
    @EnvironmentObject var toastManager: ToastManager

    @State private var showActivitySheet = false

    var body: some View {
        NavigationStack {
            ZStack {
                tronBackground

                VStack(spacing: 0) {
                    Spacer()

                    mainOrb
                        .floatUp(delay: 0.1)

                    statusIndicator
                        .padding(.top, 32)
                        .floatUp(delay: 0.2)

                    if !voiceManager.transcript.isEmpty {
                        transcriptCard
                            .padding(.top, 24)
                            .floatUp(delay: 0.25)
                    }

                    Spacer()

                    if voiceManager.status != .idle {
                        controlBar
                            .padding(.bottom, 30)
                            .floatUp(delay: 0.3)
                    }
                }
                .padding(.horizontal, 24)

                if !voiceManager.activities.isEmpty {
                    VStack {
                        HStack {
                            Spacer()
                            activityBadge
                                .padding(.top, 100)
                                .padding(.trailing, 20)
                        }
                        Spacer()
                    }
                }
            }
            .navigationTitle("Voice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.nBackground.opacity(0.9), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        showMenu = true
                    } label: {
                        Image(systemName: "line.3.horizontal")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(LinearGradient.neroGradient)
                    }
                }
            }
            .sheet(isPresented: $showActivitySheet) {
                activitySheet
                    .presentationDetents([.medium, .large])
                    .presentationDragIndicator(.visible)
                    .presentationBackground(Color.nCard)
            }
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: voiceManager.activities.count)
        .animation(.spring(response: 0.3), value: voiceManager.status)
    }

    private var tronBackground: some View {
        ZStack {
            Color.nBackground
                .ignoresSafeArea()

            GeometryReader { geo in
                ZStack {
                    RadialGradient(
                        colors: [
                            Color.neroBlue.opacity(0.08),
                            Color.neroCyan.opacity(0.03),
                            .clear
                        ],
                        center: .center,
                        startRadius: 50,
                        endRadius: geo.size.width
                    )
                    .blur(radius: 60)

                    VStack {
                        Spacer()
                        LinearGradient(
                            colors: [
                                .clear,
                                Color.neroCyan.opacity(0.05),
                                Color.neroCyan.opacity(0.1)
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                        .frame(height: 200)
                        .blur(radius: 30)
                    }
                }
            }
            .ignoresSafeArea()
        }
    }

    private var mainOrb: some View {
        Button {
            handleOrbTap()
        } label: {
            VoiceRings(
                isActive: voiceManager.status == .listening || voiceManager.status == .speaking || voiceManager.status == .connected,
                rmsLevel: voiceManager.rmsLevel,
                isSpeaking: voiceManager.status == .speaking
            )
            .frame(width: 260, height: 260)
        }
        .buttonStyle(OrbButtonStyle())
        .disabled(voiceManager.status == .connecting)
    }

    private func handleOrbTap() {
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()

        if voiceManager.status == .idle {
            Task { await voiceManager.connect() }
        } else {
            voiceManager.disconnect()
        }
    }

    private var statusIndicator: some View {
        HStack(spacing: 12) {
            if voiceManager.status == .connecting {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: Color.neroBlue))
                    .scaleEffect(0.8)
            } else if voiceManager.status != .idle {
                Circle()
                    .fill(statusColor)
                    .frame(width: 8, height: 8)
                    .shadow(color: statusColor, radius: 6)
            }

            Text(statusText)
                .font(.system(size: 16, weight: .medium, design: .monospaced))
                .foregroundColor(statusColor)
                .shadow(color: statusColor.opacity(0.5), radius: 4)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 10)
        .background(
            Capsule()
                .fill(Color.nCard.opacity(0.8))
                .overlay(
                    Capsule()
                        .stroke(statusColor.opacity(0.3), lineWidth: 1)
                )
        )
    }

    private var statusText: String {
        switch voiceManager.status {
        case .idle: return "TAP TO CONNECT"
        case .connecting: return "CONNECTING..."
        case .connected, .listening: return voiceManager.isMuted ? "MUTED" : "LISTENING"
        case .speaking: return "NERO SPEAKING"
        case .error(let msg): return msg.uppercased().prefix(20).description
        }
    }

    private var statusColor: Color {
        switch voiceManager.status {
        case .idle: return Color.nMutedForeground
        case .connecting: return Color.neroBlue
        case .connected, .listening: return voiceManager.isMuted ? Color.nError : Color.neroCyan
        case .speaking: return Color.neroCyan
        case .error: return Color.nError
        }
    }

    private var transcriptCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "quote.bubble.fill")
                    .font(.system(size: 10))
                Text("TRANSCRIPT")
                    .font(.system(size: 10, weight: .semibold, design: .monospaced))
            }
            .foregroundColor(Color.neroBlue)

            Text(voiceManager.transcript)
                .font(.system(size: 15, weight: .regular))
                .foregroundColor(.white.opacity(0.9))
                .lineLimit(3)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.nCard.opacity(0.9))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(
                            LinearGradient(
                                colors: [Color.neroBlue.opacity(0.4), Color.neroCyan.opacity(0.2)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            ),
                            lineWidth: 1
                        )
                )
        )
        .shadow(color: Color.neroBlue.opacity(0.1), radius: 10)
    }

    private var activityBadge: some View {
        Button {
            showActivitySheet = true
        } label: {
            HStack(spacing: 6) {
                if voiceManager.activities.contains(where: { $0.status == .running }) {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .white))
                        .scaleEffect(0.6)
                } else {
                    Image(systemName: "terminal.fill")
                        .font(.system(size: 12))
                }

                Text("\(voiceManager.activities.count)")
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
            }
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
                Capsule()
                    .fill(Color.neroBlue.opacity(0.8))
            )
            .overlay(
                Capsule()
                    .stroke(Color.neroCyan.opacity(0.4), lineWidth: 1)
            )
            .shadow(color: Color.neroBlue.opacity(0.4), radius: 8)
        }
    }

    private var activitySheet: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "terminal.fill")
                    .foregroundStyle(LinearGradient.neroGradient)
                Text("Activity Log")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)
                Spacer()
                Text("\(voiceManager.activities.count) items")
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(.nMutedForeground)
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)

            Divider()
                .background(Color.nBorder)
                .padding(.horizontal, 20)

            ScrollView {
                LazyVStack(spacing: 8) {
                    ForEach(voiceManager.activities.reversed()) { activity in
                        activityRow(activity)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 20)
            }
        }
    }

    private func activityRow(_ activity: ToolActivity) -> some View {
        HStack(spacing: 10) {
            activityStatusIcon(activity.status)

            Text(activity.tool)
                .font(.system(size: 13, weight: .medium, design: .monospaced))
                .foregroundColor(.white.opacity(0.85))

            Spacer()

            Text(activityStatusText(activity.status))
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(activityStatusColor(activity.status))
        }
        .padding(.vertical, 6)
        .padding(.horizontal, 10)
        .background(
            RoundedRectangle(cornerRadius: 6)
                .fill(activityStatusColor(activity.status).opacity(0.08))
        )
    }

    @ViewBuilder
    private func activityStatusIcon(_ status: ToolActivity.ToolStatus) -> some View {
        Group {
            switch status {
            case .running:
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: Color.neroBlue))
                    .scaleEffect(0.6)
            case .complete:
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(Color.neroCyan)
            case .error:
                Image(systemName: "xmark.circle.fill")
                    .foregroundColor(Color.nError)
            default:
                Image(systemName: "circle.dotted")
                    .foregroundColor(Color.nMutedForeground)
            }
        }
        .font(.system(size: 14))
        .frame(width: 18)
    }

    private func activityStatusText(_ status: ToolActivity.ToolStatus) -> String {
        switch status {
        case .running: return "RUNNING"
        case .complete: return "DONE"
        case .error: return "ERROR"
        default: return "PENDING"
        }
    }

    private func activityStatusColor(_ status: ToolActivity.ToolStatus) -> Color {
        switch status {
        case .running: return Color.neroBlue
        case .complete: return Color.neroCyan
        case .error: return Color.nError
        default: return Color.nMutedForeground
        }
    }

    private var controlBar: some View {
        HStack(spacing: 32) {
            controlButton(
                icon: voiceManager.isMuted ? "mic.slash.fill" : "mic.fill",
                label: voiceManager.isMuted ? "Unmute" : "Mute",
                color: voiceManager.isMuted ? Color.nError : Color.neroBlue,
                action: { voiceManager.toggleMute() }
            )

            controlButton(
                icon: "phone.down.fill",
                label: "End",
                color: Color.nError,
                action: { voiceManager.disconnect() }
            )
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(
            Capsule()
                .fill(Color.nCard.opacity(0.9))
                .overlay(
                    Capsule()
                        .stroke(Color.nBorder, lineWidth: 1)
                )
        )
    }

    private func controlButton(icon: String, label: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: {
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()
            action()
        }) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 22))
                    .foregroundColor(color)
                    .shadow(color: color.opacity(0.5), radius: 4)

                Text(label.uppercased())
                    .font(.system(size: 9, weight: .semibold, design: .monospaced))
                    .foregroundColor(color.opacity(0.7))
            }
            .frame(width: 60)
        }
    }
}

struct OrbButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

#Preview {
    VoiceView(showMenu: .constant(false))
        .environmentObject(VoiceManager.shared)
        .environmentObject(ToastManager.shared)
        .preferredColorScheme(.dark)
}
