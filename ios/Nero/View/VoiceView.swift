import SwiftUI

struct VoiceView: View {
    @Binding var showMenu: Bool

    @EnvironmentObject var neroManager: NeroManager
    @EnvironmentObject var voiceManager: VoiceManager
    @EnvironmentObject var toastManager: ToastManager
    @EnvironmentObject var tabRouter: TabRouter
    @EnvironmentObject var graphManager: GraphManager

    @State private var showActivitySheet = false
    @State private var lastActivityCount = 0

    private var sphereStatus: SphereStatus {
        switch voiceManager.status {
        case .idle: return .idle
        case .connecting: return .connecting
        case .connected, .listening, .speaking: return .connected
        case .error: return .error
        }
    }

    private var isActive: Bool {
        switch voiceManager.status {
        case .idle, .error: return false
        default: return true
        }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                tronBackground

                if !neroManager.isConnected {
                    disconnectedState
                } else {
                    connectedContent
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

                if !voiceManager.activities.isEmpty {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            showActivitySheet = true
                        } label: {
                            HStack(spacing: 4) {
                                if voiceManager.activities.contains(where: { $0.status == .running }) {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .neroBlue))
                                        .scaleEffect(0.6)
                                } else {
                                    Image(systemName: "terminal.fill")
                                        .font(.system(size: 12))
                                }
                                Text("\(voiceManager.activities.count)")
                                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                            }
                            .foregroundStyle(LinearGradient.neroGradient)
                        }
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
        .animation(.spring(response: 0.3), value: voiceManager.status)
        .onAppear { graphManager.startPolling() }
        .onDisappear { graphManager.stopPolling() }
        .onChange(of: voiceManager.activities) { _, newActivities in
            let running = newActivities.filter { $0.status == .running }
            if running.count > lastActivityCount {
                for activity in running.suffix(running.count - lastActivityCount) {
                    graphManager.fireToolName(activity.tool)
                }
            }
            lastActivityCount = running.count
        }
    }

    private var disconnectedState: some View {
        VStack(spacing: 24) {
            NeroSphereView(
                status: .idle,
                rmsLevel: 0,
                outputRms: 0,
                isTalking: false,
                isProcessing: false,
                isMuted: false,
                onTap: {},
                graphData: graphManager.graphData,
                toolFires: graphManager.toolFires
            )
            .frame(width: 260, height: 260)
            .floatUp(delay: 0.1)

            VStack(spacing: 8) {
                Text("Connect in Settings")
                    .font(.headline)
                    .foregroundColor(.white)

                Text("Set up a connection to start voice calls")
                    .font(.subheadline)
                    .foregroundColor(.nMutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            .floatUp(delay: 0.2)

            Button {
                tabRouter.selectedTab = .settings
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "gearshape.fill")
                    Text("Go to Settings")
                }
                .neroButton()
            }
            .padding(.horizontal, 48)
            .floatUp(delay: 0.3)
        }
    }

    private var connectedContent: some View {
        VStack(spacing: 0) {
            Spacer()

            NeroSphereView(
                status: sphereStatus,
                rmsLevel: voiceManager.rmsLevel,
                outputRms: voiceManager.outputRms,
                isTalking: voiceManager.status == .speaking,
                isProcessing: voiceManager.isProcessing,
                isMuted: voiceManager.isMuted,
                onTap: { handleOrbTap() },
                graphData: graphManager.graphData,
                toolFires: graphManager.toolFires
            )
            .frame(width: 280, height: 280)

            Spacer()

            VStack(spacing: 24) {
                statusText
                    .padding(.horizontal, 32)

                if isActive {
                    controls
                }
            }
            .padding(.bottom, 48)
        }
        .padding(.horizontal, 24)
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

    private func handleOrbTap() {
        let generator = UIImpactFeedbackGenerator(style: .medium)
        generator.impactOccurred()

        if voiceManager.status == .idle {
            Task { await voiceManager.connect() }
        } else {
            voiceManager.disconnect()
        }
    }

    @ViewBuilder
    private var statusText: some View {
        switch voiceManager.status {
        case .idle:
            Text("Tap to start talking with Nero")
                .font(.system(size: 15))
                .foregroundColor(.nMutedForeground.opacity(0.5))
                .multilineTextAlignment(.center)

        case .connecting:
            Text("Setting up voice connection...")
                .font(.system(size: 15))
                .foregroundColor(.nMutedForeground.opacity(0.6))

        case .connected, .listening:
            if !voiceManager.transcript.isEmpty {
                Text(voiceManager.transcript)
                    .font(.system(size: 15))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(3)
                    .multilineTextAlignment(.center)
            } else {
                Text("Say something to Nero")
                    .font(.system(size: 15))
                    .foregroundColor(.nMutedForeground.opacity(0.6))
                    .multilineTextAlignment(.center)
            }

        case .speaking:
            if !voiceManager.transcript.isEmpty {
                Text(voiceManager.transcript)
                    .font(.system(size: 15))
                    .foregroundColor(.white.opacity(0.7))
                    .lineLimit(3)
                    .multilineTextAlignment(.center)
            } else {
                Text("Nero is speaking...")
                    .font(.system(size: 15))
                    .foregroundColor(.nMutedForeground.opacity(0.6))
                    .multilineTextAlignment(.center)
            }

        case .error(let msg):
            Text(msg)
                .font(.system(size: 14))
                .foregroundColor(.nError.opacity(0.7))
                .multilineTextAlignment(.center)
        }
    }

    private var controls: some View {
        HStack(spacing: 20) {
            Button {
                let generator = UIImpactFeedbackGenerator(style: .light)
                generator.impactOccurred()
                voiceManager.toggleMute()
            } label: {
                Image(systemName: voiceManager.isMuted ? "mic.slash.fill" : "mic.fill")
                    .font(.system(size: 18))
                    .foregroundColor(voiceManager.isMuted ? .nError : .white.opacity(0.8))
                    .frame(width: 44, height: 44)
                    .background(
                        Circle()
                            .fill(voiceManager.isMuted ? Color.nError.opacity(0.15) : Color.white.opacity(0.08))
                    )
                    .overlay(
                        Circle()
                            .stroke(voiceManager.isMuted ? Color.nError.opacity(0.3) : Color.white.opacity(0.1), lineWidth: 1)
                    )
            }

            Button {
                let generator = UIImpactFeedbackGenerator(style: .light)
                generator.impactOccurred()
                voiceManager.disconnect()
            } label: {
                Image(systemName: "phone.down.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.nError)
                    .frame(width: 44, height: 44)
                    .background(
                        Circle()
                            .fill(Color.nError.opacity(0.15))
                    )
                    .overlay(
                        Circle()
                            .stroke(Color.nError.opacity(0.3), lineWidth: 1)
                    )
            }
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
        .environmentObject(NeroManager.shared)
        .environmentObject(VoiceManager.shared)
        .environmentObject(ToastManager.shared)
        .environmentObject(TabRouter())
        .environmentObject(GraphManager.shared)
        .preferredColorScheme(.dark)
}
