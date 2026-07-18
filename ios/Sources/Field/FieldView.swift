import SwiftUI

/// Root shell. Presence-first home (the orb), with dedicated pages: tap the orb ->
/// full-screen Voice; tap the composer -> pushed Chat; gear -> Settings sheet.
struct FieldView: View {
    let base: URL
    @Environment(\.theme) private var theme
    @StateObject private var store: NeroStore
    @StateObject private var voice: VoiceSession
    @State private var path = NavigationPath()
    @State private var showVoice = false
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
                onTalk: { showVoice = true },
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
        .fullScreenCover(isPresented: $showVoice) {
            VoiceScreen(store: store, voice: voice).environment(\.theme, theme)
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(store: store).environment(\.theme, theme)
        }
    }
}

/// The home: Nero's presence. Orb centered, a "type" bar to open chat, gear for settings.
struct HomeScreen: View {
    @Environment(\.theme) private var theme
    @ObservedObject var store: NeroStore
    var onTalk: () -> Void
    var onType: () -> Void
    var onSettings: () -> Void

    private var orbState: Orb.State {
        guard let d = store.dispatch, d.isActive else { return .idle }
        if d.activities?.contains(where: { $0.status == "running" }) == true { return .tool }
        return .thinking
    }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("NERO").font(Typeface.display(20)).tracking(2.5).foregroundStyle(theme.text.opacity(0.9))
                    HStack(spacing: 5) {
                        Circle().fill(store.connected ? theme.holo() : Color(hex: 0xf5a524)).frame(width: 4, height: 4)
                        Kicker(text: store.connected ? "online" : "connecting", size: 8.5)
                    }
                }
                Spacer()
                IconButton(system: "gearshape", size: 30, iconSize: 15, radius: 8, action: onSettings)
            }
            .padding(.horizontal, 22).padding(.top, 6)

            Spacer()
            Button(action: onTalk) { Orb(state: orbState, size: 216) }
                .buttonStyle(PressableButtonStyle(haptic: true))
            Text(store.dispatch?.isActive == true ? "thinking…" : "tap to talk")
                .font(Typeface.mono(12)).tracking(1)
                .foregroundStyle(theme.textFaint)
                .padding(.top, 22)
            Spacer()

            Button(action: onType) {
                HStack(spacing: 10) {
                    Text("›").font(Typeface.mono(15)).foregroundStyle(theme.holo(0.7))
                    Text("Message Nero").font(Typeface.ui(14)).foregroundStyle(theme.textFaint)
                    Spacer()
                    Image(systemName: "keyboard").font(.system(size: 14)).foregroundStyle(theme.textFaint)
                }
                .padding(.leading, 16).padding(.trailing, 14).padding(.vertical, 13)
                .slab()
            }
            .buttonStyle(PressableButtonStyle(haptic: false))
            .padding(.horizontal, 16).padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { Atmosphere() }
    }
}
