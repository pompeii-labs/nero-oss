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
    @State private var showProject = false
    @ObservedObject private var router = AppRouter.shared

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
                onSettings: { showSettings = true },
                onOpenProject: { showProject = true }
            )
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .chat:
                    ChatScreen(store: store,
                               onOpenProject: { showProject = true },
                               onOpenSettings: { showSettings = true })
                        .environment(\.theme, theme)
                        .toolbar(.hidden, for: .navigationBar)
                }
            }
        }
        .tint(theme.holoSoft)
        .task { store.start() }
        .onChange(of: router.route) { _, r in
            if r == .chat {
                if path.isEmpty { path.append(Route.chat) }
                router.route = nil
            }
        }
        .onDisappear { store.stop() }
        .sheet(isPresented: $showSettings) {
            SettingsView(store: store).environment(\.theme, theme)
        }
        .sheet(isPresented: $showProject) {
            if let p = store.activeProject {
                ProjectSheet(project: p, tasks: store.projectTasks(for: p), store: store)
                    .environment(\.theme, theme)
            }
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
    var onOpenProject: () -> Void

    // The dial. Press and hold the orb to ring it with eight slots; drag to one and
    // release to fire it. Built-ins are the defaults; anything Nero bound to a slot
    // displaces the built-in that sat there.
    @AppStorage("nero.theme") private var themeId: String = "vector"
    @SwiftUI.State private var dialOpen = false
    @SwiftUI.State private var dialHot: Int?
    @SwiftUI.State private var dialArmed: Int?
    @SwiftUI.State private var dialStatus = ""
    @SwiftUI.State private var customActions: [DialAction] = []
    @SwiftUI.State private var composeSlot: Int?
    @SwiftUI.State private var confirming: DialWedge?
    @SwiftUI.State private var firedThisGesture = false
    /// Holding on a filled wedge (rather than releasing) opens its picker, so a bound
    /// slot can be swapped or cleared with the same gesture that made it.
    @SwiftUI.State private var holdTask: Task<Void, Never>?
    @SwiftUI.State private var heldOpen = false
    @SwiftUI.State private var showCamera = false

    /// Long enough that dragging across a wedge on the way somewhere else never trips
    /// it; you have to mean it.
    private let HOLD_TO_EDIT_MS: Double = 3000
    private let dialSize: CGFloat = 340
    private let orbSize: CGFloat = 216

    private var voiceOn: Bool { voice.phase != .idle }

    private var orbState: Orb.State {
        if voiceOn {
            switch voice.phase {
            case .speaking: return .speaking
            case .thinking, .connecting:
                return voice.activities.contains(where: { $0.status == "running" }) ? .tool : .thinking
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
            if voiceOn, !voice.activities.isEmpty {
                ToolGroup(activities: voice.activities, live: orbState == .tool)
                    .frame(maxWidth: 320)
                    .padding(.bottom, 22)
                    .transition(.opacity)
                    .animation(Motion.glide, value: voice.activities)
            }
            orbStack
            caption(view: dialOpen ? "release on a slot" : caption)
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

    // MARK: the orb + its dial

    private var orbStack: some View {
        ZStack {
            // the orb recedes into the dial's hole so the ring clears it
            Orb(state: orbState, size: orbSize)
                .scaleEffect(dialOpen ? 0.58 : 1)
                .animation(Motion.snap, value: dialOpen)
            if dialOpen {
                RadialDial(
                    wedges: dialWedges,
                    hot: dialHot,
                    armed: dialArmed,
                    status: dialStatus,
                    diameter: dialSize
                )
                .transition(.opacity)
            }
        }
        .frame(width: dialSize, height: dialSize)
        .coordinateSpace(name: "dial")
        .contentShape(Circle())
        .gesture(dialGesture)
        .onTapGesture { if !dialOpen { toggleVoice() } }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker(
                onCapture: { jpeg in
                    showCamera = false
                    store.send("", images: [PendingImage(data: jpeg, mime: "image/jpeg", name: "photo.jpg")])
                },
                onCancel: { showCamera = false }
            )
            .ignoresSafeArea()
        }
        .sheet(isPresented: composeBinding) {
            ActionPicker(
                slot: composeSlot ?? 0,
                client: store.client,
                onBound: { Task { customActions = await store.client.actions() } },
                onDescribe: { text in describeAction(slot: composeSlot ?? 0, text: text) }
            )
            .environment(\.theme, theme)
        }
        .alert(confirming?.label ?? "", isPresented: confirmBinding) {
            Button("Run", role: .destructive) { if let w = confirming { fire(w) } }
            Button("Cancel", role: .cancel) { closeDial() }
        } message: {
            Text("This action asked to confirm before it runs.")
        }
    }

    /// Press-and-hold opens the ring, the same press drags to a wedge, release fires it.
    private var dialGesture: some Gesture {
        LongPressGesture(minimumDuration: 0.42)
            .sequenced(before: DragGesture(minimumDistance: 0, coordinateSpace: .named("dial")))
            .onChanged { value in
                switch value {
                case .first(true):
                    openDial()
                case .second(true, let drag):
                    if let drag { updateHot(drag.location) }
                default:
                    break
                }
            }
            .onEnded { value in
                guard case .second(true, let drag) = value else { return }
                release(at: drag?.location)
            }
    }

    private var dialCenter: CGPoint { CGPoint(x: dialSize / 2, y: dialSize / 2) }

    private func openDial() {
        guard !dialOpen else { return }
        // clear gesture state here rather than on close: the hold-to-edit path closes
        // the dial directly, so a flag reset only on close would leak into the next
        // press and swallow its release
        heldOpen = false
        holdTask?.cancel()
        holdTask = nil
        UIImpactFeedbackGenerator(style: .soft).impactOccurred()
        DialSfx.shared.open()
        withAnimation(Motion.snap) { dialOpen = true }
        Task { customActions = await store.client.actions() }
    }

    private func closeDial() {
        holdTask?.cancel()
        holdTask = nil
        heldOpen = false
        // a wedge that fired already played its own sound; don't stack a dismiss on top
        if dialOpen && !firedThisGesture { DialSfx.shared.close() }
        firedThisGesture = false
        withAnimation(Motion.snap) { dialOpen = false }
        dialHot = nil
        dialArmed = nil
        dialStatus = ""
        confirming = nil
        composeSlot = nil
    }

    private func updateHot(_ p: CGPoint) {
        let slot = Dial.slot(at: p, center: dialCenter, radius: dialSize / 2)
        guard slot != dialHot else { return }
        dialHot = slot

        // moving to a different wedge restarts the hold
        holdTask?.cancel()
        holdTask = nil
        if let slot, dialWedges[slot] != nil {
            holdTask = Task {
                try? await Task.sleep(for: .milliseconds(Int(HOLD_TO_EDIT_MS)))
                guard !Task.isCancelled else { return }
                heldOpen = true
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                DialSfx.shared.arm()
                composeSlot = slot
                withAnimation(Motion.snap) { dialOpen = false }
            }
        }
        // the detent: every wedge you cross ticks. This is the thing the web build
        // can't do, since Safari has no vibration API.
        if let slot {
            UISelectionFeedbackGenerator().selectionChanged()
            DialSfx.shared.tick(slot)
        }
    }

    private func release(at p: CGPoint?) {
        holdTask?.cancel()
        holdTask = nil
        if heldOpen {
            // the hold already opened the picker; releasing must not also fire
            heldOpen = false
            return
        }
        let slot = p.flatMap { Dial.slot(at: $0, center: dialCenter, radius: dialSize / 2) }
        guard let slot else { return closeDial() }
        guard let w = dialWedges[slot] else {
            // an empty slot is an invitation: ask Nero for the button you want
            composeSlot = slot
            return
        }
        if w.confirm {
            dialArmed = slot
            confirming = w
            DialSfx.shared.arm()
            return
        }
        fire(w)
    }

    private func fire(_ w: DialWedge) {
        UIImpactFeedbackGenerator(style: .rigid).impactOccurred()
        DialSfx.shared.fire(dialArmed ?? dialHot ?? 0)
        firedThisGesture = true
        if w.custom {
            let id = w.id
            Task {
                let r = await store.client.runAction(id)
                if !r.ok, !r.output.isEmpty { dialStatus = r.output }
            }
            closeDial()
            return
        }
        closeDial()
        runBuiltin(w.id)
    }

    /// The picker's "or describe it" path: hand it to Nero to author.
    private func describeAction(slot: Int, text: String) {
        store.send(
            "Create a dial action bound to slot \(slot) that does this: \(text). "
                + "Pick a short label and a fitting icon."
        )
    }

    // MARK: wedges

    /// Built-in slot order, clockwise from twelve o'clock. Slots resolve to nil when
    /// the capability isn't available right now (no call in progress, no live project),
    /// which leaves them open as invitations.
    /// Built-in slots, clockwise from twelve o'clock. Deliberately sparse: tapping the
    /// orb is already voice, chat is already the composer pill, and theme/settings are
    /// set-once chrome that doesn't earn a one-press slot. STOP only appears when
    /// there's something to stop. Everything else is yours to bind.
    private var builtinSlots: [String?] {
        [
            "camera",
            nil,
            nil,
            busy ? "stop" : nil,
            nil,
            nil,
            nil,
            nil,
        ]
    }

    /// A turn is in flight, so STOP has something to cancel.
    private var busy: Bool {
        store.dispatch?.isActive == true || voice.phase == .thinking
    }

    private func builtin(_ key: String) -> DialWedge? {
        switch key {
        case "camera": return DialWedge(id: key, label: "Camera", icon: "camera.fill")
        case "stop": return DialWedge(id: key, label: "Stop", icon: "stop.fill")
        default: return nil
        }
    }

    private func runBuiltin(_ key: String) {
        switch key {
        case "camera": showCamera = true
        case "stop":
            if voice.phase != .idle { voice.stop() } else { store.cancel() }
        default: break
        }
    }

    private var dialWedges: [DialWedge?] {
        (0..<Dial.slots).map { i in
            if let a = customActions.first(where: { $0.slot == i }) {
                return DialWedge(
                    id: a.id,
                    label: a.label,
                    icon: DialIcon.symbol(a.icon),
                    custom: true,
                    confirm: a.confirm
                )
            }
            return builtinSlots[i].flatMap(builtin)
        }
    }

    private var composeBinding: Binding<Bool> {
        Binding(get: { composeSlot != nil }, set: { if !$0 { composeSlot = nil } })
    }
    private var confirmBinding: Binding<Bool> {
        Binding(get: { confirming != nil }, set: { if !$0 { confirming = nil } })
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
            if let p = store.activeProject {
                ProjectIndicator(project: p, onTap: onOpenProject).padding(.trailing, 4)
            }
            GlassIconButton(system: "gearshape", size: 40, iconSize: 16, action: onSettings)
        }
        .padding(.horizontal, 20).padding(.top, 6)
        .animation(Motion.glide, value: store.activeProject?.id)
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

    @ViewBuilder private var bottomControls: some View {
        if voiceOn {
            HStack(spacing: 18) {
                voiceCtl(voice.muted ? "mic.slash.fill" : "mic.fill",
                         tint: voice.muted ? theme.holo2() : theme.holoSoft) { voice.toggleMute() }
                voiceCtl(voice.output == .speaker ? "speaker.wave.2.fill" : "ear.fill",
                         tint: theme.holoSoft) { voice.toggleOutput() }
                RoutePickerButton()
                Button { voice.stop() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 22, weight: .medium))
                        .foregroundStyle(theme.holo2())
                        .frame(width: 68, height: 68)
                        .glassEffect(.regular.tint(theme.holo2(0.18)).interactive(), in: .circle)
                }
                .buttonStyle(PressableButtonStyle())
            }
        } else {
            GlassPillButton(system: "text.bubble", title: "Message Nero", action: onType)
        }
    }

    private func voiceCtl(_ system: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: system)
                .font(.system(size: 19, weight: .medium))
                .foregroundStyle(tint)
                .frame(width: 58, height: 58)
                .glassEffect(.regular.tint(theme.holo(0.10)).interactive(), in: .circle)
        }
        .buttonStyle(PressableButtonStyle())
    }

    private func toggleVoice() {
        if voiceOn { voice.stop() } else { voice.start() }
    }
}
