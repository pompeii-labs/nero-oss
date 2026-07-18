import SwiftUI

/// The Field: Nero's presence + the conversation. Header (orb + wordmark + voice +
/// settings), the chat thread (history + live streaming turn + tool activity), and
/// the composer. Voice is a full-screen presence cover; settings a sheet.
struct FieldView: View {
    let base: URL
    @Environment(\.theme) private var theme
    @StateObject private var store: NeroStore
    @State private var draft = ""
    @State private var showSettings = false
    @State private var voiceMode = false

    init(base: URL) {
        self.base = base
        _store = StateObject(wrappedValue: NeroStore(base: base))
    }

    private var orbState: Orb.State {
        guard let d = store.dispatch, d.isActive else { return .idle }
        if d.activities?.contains(where: { $0.status == "running" }) == true { return .tool }
        return .thinking
    }

    // MARK: docked cards

    private var pendingQuestion: Question? { store.questions.first { $0.isPending } }
    private var approvalProject: Project? { store.projects.first { $0.status == "awaiting_approval" } }
    private var mergeProject: Project? { store.projects.first { $0.merge_conflict != nil } }
    private var dashboardProjects: [Project] {
        store.projects.filter { ["running", "paused", "done"].contains($0.status ?? "") && !($0.dismissed ?? false) }
    }

    /// The bottom dock: a pending question or project decision replaces the composer.
    @ViewBuilder private var dock: some View {
        if let q = pendingQuestion {
            cardScroll {
                AskCard(
                    question: q,
                    onSubmit: { answers in Task { await store.client.answer(q.id, answers: answers) } },
                    onDismiss: { Task { await store.client.answer(q.id, answers: [], dismiss: true) } }
                )
            }
        } else if let p = approvalProject {
            cardScroll { ProjectApprovalCard(project: p, store: store) }
        } else if let p = mergeProject {
            cardScroll { MergeApprovalCard(project: p, store: store) }
        } else {
            Composer(
                draft: $draft,
                busy: store.liveDispatch != nil,
                onSend: { store.send(draft); draft = "" },
                onStop: { store.cancel() }
            )
        }
    }

    private func cardScroll<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        ScrollView(.vertical, showsIndicators: false) { content() }
            .frame(maxHeight: 460)
    }

    /// A compact horizontal rail of live project dashboards.
    @ViewBuilder private var dashboardRail: some View {
        if !dashboardProjects.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(dashboardProjects) { p in
                        ProjectDashboardCard(
                            project: p,
                            tasks: store.tasks.filter { $0.project_id == p.id },
                            store: store
                        )
                        .frame(width: 300)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 4)
            }
        }
    }

    var body: some View {
        ZStack {
            Atmosphere()
            VStack(spacing: 0) {
                header
                dashboardRail
                PanelStack(store: store)
                thread
                dock
                    .padding(.horizontal, 16)
                    .padding(.bottom, 6)
            }
        }
        .task { store.start() }
        .onDisappear { store.stop() }
        .sheet(isPresented: $showSettings) {
            SettingsView(store: store).environment(\.theme, theme)
        }
        .fullScreenCover(isPresented: $voiceMode) {
            PresenceView(store: store, base: base).environment(\.theme, theme)
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Orb(state: orbState, size: 40).frame(width: 40, height: 40)
            VStack(alignment: .leading, spacing: 1) {
                Text("NERO").font(Typeface.display(22)).tracking(3).foregroundStyle(theme.text)
                HStack(spacing: 5) {
                    Circle().fill(store.connected ? theme.holo() : Color(hex: 0xf5a524)).frame(width: 5, height: 5)
                    Text(store.connected ? "ONLINE" : "CONNECTING")
                        .font(Typeface.mono(9)).tracking(1.4).foregroundStyle(theme.textFaint)
                }
            }
            Spacer()
            Button { voiceMode = true } label: { icon("mic.fill") }
            Button { showSettings = true } label: { icon("gearshape") }
        }
        .padding(.horizontal, 18).padding(.top, 6).padding(.bottom, 6)
    }

    private func icon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 15))
            .foregroundStyle(theme.textDim)
            .frame(width: 38, height: 38)
            .background(theme.holo(0.05), in: Circle())
            .overlay(Circle().strokeBorder(theme.holo(0.12)))
    }

    private var bubbles: [ChatMessage] { store.messages.filter(\.isBubble) }

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 18) {
                    if bubbles.isEmpty && store.liveDispatch == nil {
                        Text("What are we working on?")
                            .font(Typeface.display(24))
                            .foregroundStyle(theme.textDim)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 120)
                    }
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
                .padding(.horizontal, 20).padding(.vertical, 10)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: store.messages.count) { _, _ in withAnimation(Motion.snap) { proxy.scrollTo("bottom") } }
            .onChange(of: store.liveDispatch?.streaming_text) { _, _ in proxy.scrollTo("bottom") }
        }
    }
}
