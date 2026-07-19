import SwiftUI

/// Dedicated text page: the conversation thread with the composer floating at the
/// bottom (fades the thread under it). Decision cards dock here above the composer.
struct ChatScreen: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var store: NeroStore
    var onOpenProject: () -> Void = {}
    @State private var draft = ""
    @State private var cmdResult: String?
    @State private var showDecision = false
    @State private var decisionDismissed = false
    @FocusState private var focused: Bool

    private var bubbles: [ChatMessage] { store.messages.filter(\.isBubble) }
    private var slashPartial: String? {
        guard draft.hasPrefix("/"), !draft.contains(" ") else { return nil }
        return String(draft.dropFirst())
    }
    private var suggestions: [SlashCommand] { slashPartial.map { Slash.suggestions($0) } ?? [] }
    private var pendingQuestion: Question? { store.questions.first { $0.isPending } }
    private var approvalProject: Project? { store.projects.first { $0.status == "awaiting_approval" } }
    private var mergeProject: Project? { store.projects.first { $0.merge_conflict != nil } }
    private var hasDecision: Bool { pendingQuestion != nil || approvalProject != nil || mergeProject != nil }
    private var decisionLabel: String {
        if pendingQuestion != nil { return "answer" }
        if approvalProject != nil { return "review plan" }
        return "resolve merge"
    }

    private var decisionChip: some View {
        Button { decisionDismissed = false; showDecision = true } label: {
            HStack(spacing: 5) {
                Circle().fill(theme.holo2()).frame(width: 6, height: 6).shadow(color: theme.holo2(0.7), radius: 3)
                Text(decisionLabel).font(Typeface.mono(10)).tracking(0.4).foregroundStyle(theme.holo2())
            }
            .padding(.horizontal, 11).padding(.vertical, 6)
            .glassEffect(.regular.tint(theme.holo2(0.14)).interactive(), in: .capsule)
        }
        .buttonStyle(PressableButtonStyle())
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            thread
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background { Atmosphere() }
        .safeAreaInset(edge: .bottom, spacing: 0) { dock }
        .onAppear {
            if bubbles.isEmpty && !hasDecision { focused = true }
            if hasDecision { showDecision = true }
        }
        .onChange(of: hasDecision) { _, has in
            if has { if !decisionDismissed { showDecision = true } }
            else { showDecision = false; decisionDismissed = false }
        }
        .onChange(of: showDecision) { _, show in if show { focused = false } }
        .sheet(isPresented: $showDecision, onDismiss: { if hasDecision { decisionDismissed = true } }) {
            decisionSheet
        }
    }

    @ViewBuilder private var decisionSheet: some View {
        ScrollView {
            VStack(spacing: 12) {
                if let q = pendingQuestion {
                    AskCard(
                        question: q,
                        onSubmit: { a in showDecision = false; Task { await store.client.answer(q.id, answers: a) } },
                        onDismiss: { showDecision = false; Task { await store.client.answer(q.id, answers: [], dismiss: true) } }
                    )
                } else if let p = approvalProject {
                    ProjectApprovalCard(project: p, store: store)
                } else if let p = mergeProject {
                    MergeApprovalCard(project: p, store: store)
                }
            }
            .padding(16)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(theme.void_.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationBackground(theme.void_)
        .presentationDragIndicator(.visible)
        .environment(\.theme, theme)
    }

    private var header: some View {
        HStack(spacing: 12) {
            GlassIconButton(system: "chevron.left", size: 38, iconSize: 15) { dismiss() }
            Text("NERO").font(Typeface.display(19)).tracking(2).foregroundStyle(theme.text)
            Spacer()
            if hasDecision && !showDecision { decisionChip }
            if let p = store.activeProject {
                ProjectIndicator(project: p, onTap: onOpenProject)
            }
            statusDot
        }
        .padding(.horizontal, 16).padding(.top, 4).padding(.bottom, 8)
    }

    private var statusDot: some View {
        let active = store.dispatch?.isActive == true
        let c = active ? theme.holo() : (store.connected ? theme.holo(0.55) : Color(hex: 0xf5a524))
        return Circle()
            .fill(c)
            .frame(width: 7, height: 7)
            .shadow(color: active ? theme.holo(0.9) : .clear, radius: 5)
            .padding(.trailing, 6)
            .animation(Motion.glide, value: active)
    }

    private var thread: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ForEach(bubbles) { m in
                        VStack(alignment: .leading, spacing: 10) {
                            if m.isAssistant, let acts = store.toolsByDispatch[m.dispatch_id ?? ""], !acts.isEmpty {
                                ToolGroup(activities: acts)
                            }
                            MessageBubble(role: m.role ?? "assistant", text: m.content ?? "",
                                          images: m.images, base: store.client.base)
                        }
                        .id(m.id)
                    }
                    if let d = store.liveDispatch {
                        VStack(alignment: .leading, spacing: 10) {
                            if let acts = d.activities, !acts.isEmpty { ToolGroup(activities: acts, live: true) }
                            if let t = d.streaming_text, !t.isEmpty { MessageBubble(role: "assistant", text: t) }
                        }
                    }
                    Color.clear.frame(height: 8).id("bottom")
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20).padding(.top, 10)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: store.messages.count) { _, _ in withAnimation(Motion.snap) { proxy.scrollTo("bottom") } }
            .onChange(of: store.liveDispatch?.streaming_text) { _, _ in proxy.scrollTo("bottom") }
            .onAppear {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
        }
    }

    private func handleSend(_ images: [PendingImage] = []) {
        let text = draft
        if text.hasPrefix("/") {
            draft = ""
            guard let (cmd, args) = Slash.parse(text) else {
                cmdResult = "Unknown command. Type /help for the list."
                return
            }
            Task {
                let r = await cmd.run(store, args)
                await MainActor.run { cmdResult = r }
            }
        } else {
            store.send(text, images: images)
            draft = ""
        }
    }

    private var suggestionList: some View {
        VStack(spacing: 0) {
            ForEach(suggestions) { c in
                Button {
                    draft = "/\(c.name)"
                    handleSend()
                } label: {
                    HStack(spacing: 10) {
                        Text("/\(c.name)").font(Typeface.mono(13)).foregroundStyle(theme.holoSoft)
                        Text(c.description).font(Typeface.ui(12)).foregroundStyle(theme.textDim)
                            .lineLimit(1)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 12).padding(.vertical, 10)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .overlay(alignment: .top) {
                    if c.id != suggestions.first?.id {
                        Rectangle().fill(theme.holo(0.08)).frame(height: 1).padding(.leading, 12)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.void_, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .background(theme.holo(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(theme.holo(0.2)))
        .shadow(color: .black.opacity(0.5), radius: 16, y: 6)
    }

    private func resultCard(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            ScrollView { Text(text).font(Typeface.mono(12)).foregroundStyle(theme.textDim).frame(maxWidth: .infinity, alignment: .leading) }
                .frame(maxHeight: 220)
            Button { cmdResult = nil } label: {
                Image(systemName: "xmark").font(.system(size: 12, weight: .bold)).foregroundStyle(theme.textFaint)
            }
            .buttonStyle(.plain)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.holo(0.05), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(theme.holo(0.18)))
    }

    @ViewBuilder private func liveStatus(_ d: DispatchState) -> some View {
        if (d.streaming_text ?? "").isEmpty {
            HStack(spacing: 8) {
                PulseDot()
                Text(statusLabel(d.status)).font(Typeface.mono(12)).tracking(1).foregroundStyle(theme.textFaint)
            }
            .padding(.leading, 4).padding(.bottom, 2)
        }
    }

    private func statusLabel(_ s: String?) -> String {
        switch s {
        case "running": return "working…"
        case "compacting": return "compacting…"
        default: return "thinking…"
        }
    }

    @ViewBuilder private var dock: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let r = cmdResult { resultCard(r) }
            if !suggestions.isEmpty { suggestionList }
            if let d = store.liveDispatch { liveStatus(d) }
            Composer(
                draft: $draft,
                busy: store.liveDispatch != nil,
                focused: $focused,
                onSend: { imgs in handleSend(imgs) },
                onStop: { store.cancel() }
            )
        }
        .padding(.horizontal, 14).padding(.top, 10).padding(.bottom, 6)
        .background(
            LinearGradient(colors: [theme.void_.opacity(0), theme.void_.opacity(0.92)], startPoint: .top, endPoint: .center)
        )
    }
}
