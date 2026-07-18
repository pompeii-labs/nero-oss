import SwiftUI

/// Presence-first home. You open to Nero himself: a large living orb, centered.
/// Tap it to talk; a composer is always a tap away to type. The conversation is a
/// surface that rises when you type. No panels on mobile.
struct FieldView: View {
    let base: URL
    @Environment(\.theme) private var theme
    @StateObject private var store: NeroStore
    @StateObject private var voice: VoiceSession
    @State private var mode: Mode = .presence
    @State private var draft = ""
    @State private var showSettings = false
    @FocusState private var composerFocused: Bool

    enum Mode { case presence, conversation }

    init(base: URL) {
        self.base = base
        _store = StateObject(wrappedValue: NeroStore(base: base))
        _voice = StateObject(wrappedValue: VoiceSession(base: base))
    }

    private var engaged: Bool { voice.phase != .idle }

    private var orbState: Orb.State {
        if engaged {
            switch voice.phase {
            case .connecting, .thinking: return .thinking
            case .speaking: return .speaking
            default: return .idle
            }
        }
        guard let d = store.dispatch, d.isActive else { return .idle }
        if d.activities?.contains(where: { $0.status == "running" }) == true { return .tool }
        return .thinking
    }

    private var pendingQuestion: Question? { store.questions.first { $0.isPending } }
    private var approvalProject: Project? { store.projects.first { $0.status == "awaiting_approval" } }
    private var mergeProject: Project? { store.projects.first { $0.merge_conflict != nil } }
    private var hasDecision: Bool { pendingQuestion != nil || approvalProject != nil || mergeProject != nil }
    private var bubbles: [ChatMessage] { store.messages.filter(\.isBubble) }
    private var lastAssistant: String? {
        bubbles.last(where: { $0.isAssistant })?.content?.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    var body: some View {
        ZStack {
            Atmosphere()
            Group {
                if mode == .presence { presence } else { conversation }
            }
            .frame(width: screenWidth)
        }
        .task { store.start() }
        .onDisappear { store.stop(); voice.stop() }
        .onChange(of: hasDecision) { _, has in
            if has, mode == .presence { withAnimation(Motion.glide) { mode = .conversation } }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView(store: store).environment(\.theme, theme)
        }
    }

    // MARK: - Presence (home)

    private var presence: some View {
        VStack(spacing: 0) {
            topBar.padding(.horizontal, 22)
            Spacer(minLength: 0)
            VStack(spacing: 24) {
                if engaged, let a = voice.activity { activityChip(a) }
                Button { toggleVoice() } label: { Orb(state: orbState, size: 216) }
                    .buttonStyle(.plain)
                caption
            }
            .frame(maxWidth: .infinity)
            Spacer(minLength: 0)
            bottomBar.padding(.horizontal, 16)
        }
        .padding(.top, 6)
        .padding(.bottom, 8)
    }

    private var screenWidth: CGFloat {
        (UIApplication.shared.connectedScenes.first as? UIWindowScene)?.screen.bounds.width
            ?? UIScreen.main.bounds.width
    }

    @ViewBuilder private var caption: some View {
        if engaged {
            Text(voice.transcript.isEmpty ? (voice.errorText ?? voiceHint) : voice.transcript)
                .font(voice.transcript.isEmpty ? Typeface.mono(12) : Typeface.display(23))
                .foregroundStyle(voice.transcript.isEmpty ? theme.textFaint : theme.text)
                .multilineTextAlignment(.center)
                .lineLimit(3)
                .frame(maxWidth: 320, minHeight: 48)
                .animation(.easeInOut, value: voice.transcript)
        } else if store.dispatch?.isActive == true {
            Text("thinking…").font(Typeface.mono(12)).foregroundStyle(theme.textFaint).frame(minHeight: 48)
        } else if let last = lastAssistant, !last.isEmpty {
            Button { enterConversation() } label: {
                Text(last).font(Typeface.ui(14)).foregroundStyle(theme.textDim)
                    .multilineTextAlignment(.center).lineLimit(2)
            }
            .buttonStyle(.plain)
            .frame(maxWidth: 320, minHeight: 48)
        } else {
            Text("tap to talk").font(Typeface.mono(12)).tracking(1).foregroundStyle(theme.textFaint).frame(minHeight: 48)
        }
    }

    /// Bottom of the presence screen: a decision card if one's waiting, else a
    /// "tap to type" bar that opens the conversation.
    @ViewBuilder private var bottomBar: some View {
        if hasDecision {
            decisionDock
        } else {
            Button { enterConversation() } label: {
                HStack(spacing: 10) {
                    Text("›").font(Typeface.mono(16)).foregroundStyle(theme.holo(0.7))
                    Text("Message Nero").font(Typeface.ui(15)).foregroundStyle(theme.textFaint)
                    Spacer()
                }
                .padding(.horizontal, 14).padding(.vertical, 12)
                .glass(radius: 18, strokeAlpha: 0.22)
            }
            .buttonStyle(.plain)
        }
    }

    // MARK: - Conversation

    private var conversation: some View {
        VStack(spacing: 0) {
            conversationHeader
            thread
            if hasDecision {
                decisionDock.padding(.horizontal, 16).padding(.bottom, 6)
            } else {
                Composer(
                    draft: $draft,
                    busy: store.liveDispatch != nil,
                    onSend: { store.send(draft); draft = "" },
                    onStop: { store.cancel() }
                )
                .focused($composerFocused)
                .padding(.horizontal, 16).padding(.bottom, 6)
            }
        }
    }

    private var conversationHeader: some View {
        HStack(spacing: 12) {
            Button { withAnimation(Motion.glide) { mode = .presence }; composerFocused = false } label: {
                Image(systemName: "chevron.down").font(.system(size: 15, weight: .semibold)).foregroundStyle(theme.textDim)
                    .frame(width: 34, height: 34)
            }
            Button { toggleVoice() } label: { Orb(state: orbState, size: 30).frame(width: 30, height: 30) }
                .buttonStyle(.plain)
            Text("NERO").font(Typeface.display(19)).tracking(2).foregroundStyle(theme.text)
            Spacer()
            Button { showSettings = true } label: {
                Image(systemName: "gearshape").font(.system(size: 15)).foregroundStyle(theme.textDim).frame(width: 34, height: 34)
            }
        }
        .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 4)
    }

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    ForEach(bubbles) { m in
                        MessageBubble(role: m.role ?? "assistant", text: m.content ?? "").id(m.id)
                    }
                    if let d = store.liveDispatch {
                        if let acts = d.activities, !acts.isEmpty { ToolGroup(activities: acts) }
                        if let t = d.streaming_text, !t.isEmpty {
                            MessageBubble(role: "assistant", text: t)
                        } else {
                            Text("thinking…").font(Typeface.mono(12)).foregroundStyle(theme.textFaint)
                        }
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 20).padding(.vertical, 12)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: store.messages.count) { _, _ in withAnimation(Motion.snap) { proxy.scrollTo("bottom") } }
            .onChange(of: store.liveDispatch?.streaming_text) { _, _ in proxy.scrollTo("bottom") }
            .onAppear { proxy.scrollTo("bottom") }
        }
    }

    // MARK: - Shared pieces

    private var topBar: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text("NERO").font(Typeface.display(20)).tracking(2.5).foregroundStyle(theme.text.opacity(0.85))
                HStack(spacing: 5) {
                    Circle().fill(store.connected ? theme.holo() : Color(hex: 0xf5a524)).frame(width: 4, height: 4)
                    Text(store.connected ? "ONLINE" : "CONNECTING")
                        .font(Typeface.mono(8.5)).tracking(1.4).foregroundStyle(theme.textFaint)
                }
            }
            Spacer()
            Button { showSettings = true } label: {
                Image(systemName: "gearshape").font(.system(size: 15)).foregroundStyle(theme.textDim.opacity(0.7))
                    .frame(width: 36, height: 36)
            }
        }
        .padding(.top, 4)
    }

    @ViewBuilder private var decisionDock: some View {
        ScrollView(.vertical, showsIndicators: false) {
            if let q = pendingQuestion {
                AskCard(
                    question: q,
                    onSubmit: { answers in Task { await store.client.answer(q.id, answers: answers) } },
                    onDismiss: { Task { await store.client.answer(q.id, answers: [], dismiss: true) } }
                )
            } else if let p = approvalProject {
                ProjectApprovalCard(project: p, store: store)
            } else if let p = mergeProject {
                MergeApprovalCard(project: p, store: store)
            }
        }
        .frame(maxHeight: 460)
    }

    private func activityChip(_ a: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(theme.holoSoft).frame(width: 5, height: 5)
            Text(a).font(Typeface.mono(11)).foregroundStyle(theme.textDim)
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(theme.holo(0.06), in: Capsule())
        .overlay(Capsule().strokeBorder(theme.holo(0.18)))
    }

    private var voiceHint: String {
        switch voice.phase {
        case .idle: return "tap to talk"
        case .connecting: return "connecting…"
        case .listening: return "listening"
        case .thinking: return "thinking…"
        case .speaking: return "speaking"
        }
    }

    private func toggleVoice() { engaged ? voice.stop() : voice.start() }
    private func enterConversation() {
        withAnimation(Motion.glide) { mode = .conversation }
        composerFocused = true
    }
}
