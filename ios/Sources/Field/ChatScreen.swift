import SwiftUI

/// Dedicated text page: the conversation thread with the composer floating at the
/// bottom (fades the thread under it). Decision cards dock here above the composer.
struct ChatScreen: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: NeroStore
    @State private var draft = ""
    @FocusState private var focused: Bool

    private var orbState: Orb.State {
        guard let d = store.dispatch, d.isActive else { return .idle }
        if d.activities?.contains(where: { $0.status == "running" }) == true { return .tool }
        return .thinking
    }
    private var bubbles: [ChatMessage] { store.messages.filter(\.isBubble) }
    private var pendingQuestion: Question? { store.questions.first { $0.isPending } }
    private var approvalProject: Project? { store.projects.first { $0.status == "awaiting_approval" } }
    private var mergeProject: Project? { store.projects.first { $0.merge_conflict != nil } }
    private var hasDecision: Bool { pendingQuestion != nil || approvalProject != nil || mergeProject != nil }

    var body: some View {
        VStack(spacing: 0) {
            header
            thread
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { Atmosphere() }
        .safeAreaInset(edge: .bottom, spacing: 0) { dock }
        .onAppear { if bubbles.isEmpty { focused = true } }
    }

    private var header: some View {
        HStack(spacing: 10) {
            IconButton(system: "chevron.left", size: 34, iconSize: 15, radius: 8) { dismiss() }
            Orb(state: orbState, size: 26).frame(width: 26, height: 26)
            Text("NERO").font(Typeface.display(18)).tracking(2).foregroundStyle(theme.text)
            Spacer()
        }
        .padding(.horizontal, 14).padding(.top, 4).padding(.bottom, 6)
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
                            Text("thinking…").font(Typeface.mono(12)).tracking(1).foregroundStyle(theme.textFaint)
                        }
                    }
                    Color.clear.frame(height: 8).id("bottom")
                }
                .padding(.horizontal, 20).padding(.top, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: store.messages.count) { _, _ in withAnimation(Motion.snap) { proxy.scrollTo("bottom") } }
            .onChange(of: store.liveDispatch?.streaming_text) { _, _ in proxy.scrollTo("bottom") }
            .onAppear { proxy.scrollTo("bottom") }
        }
    }

    @ViewBuilder private var dock: some View {
        VStack(spacing: 0) {
            if hasDecision {
                ScrollView(.vertical, showsIndicators: false) {
                    if let q = pendingQuestion {
                        AskCard(
                            question: q,
                            onSubmit: { a in Task { await store.client.answer(q.id, answers: a) } },
                            onDismiss: { Task { await store.client.answer(q.id, answers: [], dismiss: true) } }
                        )
                    } else if let p = approvalProject {
                        ProjectApprovalCard(project: p, store: store)
                    } else if let p = mergeProject {
                        MergeApprovalCard(project: p, store: store)
                    }
                }
                .frame(maxHeight: 440)
            } else {
                Composer(
                    draft: $draft,
                    busy: store.liveDispatch != nil,
                    focused: $focused,
                    onSend: { store.send(draft); draft = "" },
                    onStop: { store.cancel() }
                )
            }
        }
        .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 6)
        .background(
            LinearGradient(colors: [theme.void_.opacity(0), theme.void_.opacity(0.92)], startPoint: .top, endPoint: .center)
        )
    }
}
