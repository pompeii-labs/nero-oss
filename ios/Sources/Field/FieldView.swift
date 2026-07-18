import SwiftUI

/// Root shell. The home IS the voice view: tap the orb to talk in place (the composer
/// pill becomes voice controls). Tap the pill -> pushed Chat; gear -> Settings sheet.
struct FieldView: View {
    let base: URL
    @Environment(\.theme) private var theme
    @StateObject private var store: NeroStore
    @StateObject private var voice: VoiceSession
    @State private var path = NavigationPath()
    @State private var showSettings = false

    enum Route: Hashable { case chat }

    init(base: URL) {
        self.base = base
        _store = StateObject(wrappedValue: NeroStore(base: base))
        _voice = StateObject(wrappedValue: VoiceSession(base: base))
    }

    var body: some View {
        NavigationStack(path: $path) {
            HomeScreen(
                store: store,
                voice: voice,
                onType: { path.append(Route.chat) },
                onSettings: { showSettings = true }
            )
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .chat:
                    ChatScreen(store: store)
                        .environment(\.theme, theme)
                        .toolbar(.hidden, for: .navigationBar)
                }
            }
        }
        .tint(theme.holoSoft)
        .task { store.start() }
        .onDisappear { store.stop() }
        .sheet(isPresented: $showSettings) {
            SettingsView(store: store).environment(\.theme, theme)
        }
    }
}

/// The home: Nero's presence. Orb centered. Tapping it opens a live voice session in
/// place, the "Message Nero" pill swapping for voice controls; the orb, a transcript,
/// and an activity chip reflect the live turn. Tapping the pill opens Chat.
struct HomeScreen: View {
    @Environment(\.theme) private var theme
    @ObservedObject var store: NeroStore
    @ObservedObject var voice: VoiceSession
    var onType: () -> Void
    var onSettings: () -> Void

    private var voiceOn: Bool { voice.phase != .idle }

    private var orbState: Orb.State {
        if voiceOn {
            switch voice.phase {
            case .speaking: return .speaking
            case .thinking, .connecting: return .thinking
            default: return .idle
            }
        }
        guard let d = store.dispatch, d.isActive else { return .idle }
        if d.activities?.contains(where: { $0.status == "running" }) == true { return .tool }
        return .thinking
    }

    private var caption: String {
        guard voiceOn else { return store.dispatch?.isActive == true ? "thinking…" : "tap to talk" }
        switch voice.phase {
        case .connecting: return "connecting…"
        case .listening: return "listening"
        case .thinking: return "thinking…"
        case .speaking: return "speaking"
        case .idle: return "tap to talk"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Spacer()
            if voiceOn, let a = voice.activity { activityChip(a).padding(.bottom, 22) }
            Button { toggleVoice() } label: { Orb(state: orbState, size: 216) }
                .buttonStyle(PressableButtonStyle(haptic: true))
            caption(view: caption)
            if voiceOn { transcript }
            Spacer()
            bottomControls
                .padding(.bottom, voiceOn ? 30 : 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { Atmosphere() }
        .animation(Motion.glide, value: voiceOn)
        .onDisappear { if voiceOn { voice.stop() } }
    }

    private var topBar: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("NERO").font(Typeface.display(20)).tracking(2.5).foregroundStyle(theme.text.opacity(0.9))
                HStack(spacing: 5) {
                    Circle().fill(store.connected ? theme.holo() : Color(hex: 0xf5a524)).frame(width: 4, height: 4)
                    Kicker(text: store.connected ? "online" : "connecting", size: 8.5)
                }
            }
            Spacer()
            GlassIconButton(system: "gearshape", size: 40, iconSize: 16, action: onSettings)
        }
        .padding(.horizontal, 20).padding(.top, 6)
    }

    private func caption(view text: String) -> some View {
        Text(text)
            .font(Typeface.mono(12)).tracking(1)
            .foregroundStyle(voice.errorText != nil ? theme.holo2() : theme.textFaint)
            .padding(.top, 22)
            .animation(.easeInOut, value: text)
    }

    @ViewBuilder private var transcript: some View {
        if !voice.transcript.isEmpty {
            Text(voice.transcript)
                .font(Typeface.display(22)).foregroundStyle(theme.text)
                .multilineTextAlignment(.center).lineLimit(4)
                .frame(maxWidth: 320)
                .padding(.top, 20)
                .transition(.opacity)
                .animation(.easeInOut, value: voice.transcript)
        }
    }

    private func activityChip(_ a: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(theme.holoSoft).frame(width: 5, height: 5)
            Text(a).font(Typeface.mono(11)).foregroundStyle(theme.textDim)
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .glassEffect(.regular.tint(theme.holo(0.10)), in: .capsule)
    }

    @ViewBuilder private var bottomControls: some View {
        if voiceOn {
            HStack(spacing: 24) {
                Button { voice.toggleMute() } label: {
                    Image(systemName: voice.muted ? "mic.slash.fill" : "mic.fill")
                        .font(.system(size: 20, weight: .medium))
                        .foregroundStyle(voice.muted ? theme.holo2() : theme.holoSoft)
                        .frame(width: 60, height: 60)
                        .glassEffect(.regular.tint(theme.holo(voice.muted ? 0.03 : 0.10)).interactive(), in: .circle)
                }
                .buttonStyle(PressableButtonStyle())

                Button { voice.stop() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(theme.holo2())
                        .frame(width: 72, height: 72)
                        .glassEffect(.regular.tint(theme.holo2(0.18)).interactive(), in: .circle)
                }
                .buttonStyle(PressableButtonStyle())

                RoutePickerButton()
            }
        } else {
            GlassPillButton(system: "text.bubble", title: "Message Nero", action: onType)
        }
    }

    private func toggleVoice() {
        if voiceOn { voice.stop() } else { voice.start() }
    }
}
