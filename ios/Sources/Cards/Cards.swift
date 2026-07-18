import SwiftUI

// MARK: - Shared bits

/// A small uppercase mono pill used for headers on the interactive cards.
private struct CardChip: View {
    @Environment(\.theme) private var theme
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(Typeface.mono(9.5)).tracking(1.2)
            .foregroundStyle(theme.text)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background(theme.holo(0.14), in: Capsule())
            .overlay(Capsule().strokeBorder(theme.holo(0.3)))
    }
}

/// A full-width primary action button (mono, holo-tinted).
private struct PrimaryCardButton: View {
    @Environment(\.theme) private var theme
    let title: String
    let action: () -> Void
    var enabled: Bool = true
    var body: some View {
        Button(action: action) {
            Text(title)
                .font(Typeface.mono(12)).tracking(1.2)
                .foregroundStyle(theme.text)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(theme.holo(enabled ? 0.18 : 0.06), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(theme.holo(enabled ? 0.55 : 0.2)))
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.5)
    }
}

/// A ghost (outline) action button, optionally destructive.
private struct GhostCardButton: View {
    @Environment(\.theme) private var theme
    let title: String
    let action: () -> Void
    var danger: Bool = false
    var body: some View {
        Button(action: action) {
            Text(title.uppercased())
                .font(Typeface.mono(11)).tracking(1)
                .foregroundStyle(danger ? Color(hex: 0xe7674a) : theme.textDim)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background((danger ? Color(hex: 0xe7674a) : theme.holo()).opacity(0.06), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder((danger ? Color(hex: 0xe7674a) : theme.holo()).opacity(0.22)))
        }
        .buttonStyle(.plain)
    }
}

// MARK: - AskCard

/// A wizard that steps through a question's items, returning one answer array per
/// item. Single-select advances on tap; multi toggles then advances via a button.
/// An "Other" free-text row overrides the picked option(s). A review step submits.
struct AskCard: View {
    @Environment(\.theme) private var theme
    let question: Question
    let onSubmit: ([[String]]) -> Void
    let onDismiss: () -> Void

    @State private var qi = 0
    @State private var reviewing = false
    @State private var selections: [[String]] = []
    @State private var others: [String] = []

    private var items: [AskItem] { question.items ?? [] }
    private var item: AskItem? { items.indices.contains(qi) ? items[qi] : nil }
    private var single: Bool { items.count == 1 && !(item?.multi ?? false) }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            if reviewing {
                reviewStep
            } else if let it = item {
                questionStep(it)
            }
        }
        .padding(16)
        .glass(radius: 18, strokeAlpha: 0.28)
        .onAppear(perform: reset)
        .onChange(of: question.id) { _, _ in reset() }
    }

    private func reset() {
        if selections.count != items.count { selections = items.map { _ in [] } }
        if others.count != items.count { others = items.map { _ in "" } }
        qi = 0
        reviewing = false
    }

    private var header: some View {
        HStack(spacing: 8) {
            Circle().fill(theme.holo()).frame(width: 6, height: 6).shadow(color: theme.holo(0.8), radius: 3)
            if reviewing {
                CardChip(text: "Review")
            } else if let h = item?.header, !h.isEmpty {
                CardChip(text: h)
            }
            Text("NERO ASKS").font(Typeface.mono(10)).tracking(1.6).foregroundStyle(theme.textFaint)
            if items.count > 1 {
                Text("\(reviewing ? items.count : qi + 1)/\(items.count)")
                    .font(Typeface.mono(10)).foregroundStyle(theme.textDim)
            }
            Spacer()
            Button(action: onDismiss) {
                Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(theme.textFaint)
            }
        }
    }

    private func questionStep(_ it: AskItem) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(it.question)
                .font(Typeface.display(19)).foregroundStyle(theme.text)
                .fixedSize(horizontal: false, vertical: true)
            VStack(spacing: 7) {
                ForEach(Array(it.options.enumerated()), id: \.element.id) { idx, opt in
                    optionRow(idx: idx, opt: opt)
                }
                otherRow
            }
            if it.multi ?? false {
                PrimaryCardButton(
                    title: qi < items.count - 1 ? "NEXT" : "REVIEW",
                    action: goNext,
                    enabled: true
                )
            }
        }
    }

    private func optionRow(idx: Int, opt: AskOption) -> some View {
        let picked = isPicked(opt.label)
        return Button { pickOption(idx) } label: {
            HStack(alignment: .top, spacing: 11) {
                Text("\(idx + 1)")
                    .font(Typeface.mono(11)).foregroundStyle(theme.textDim)
                    .frame(width: 20, height: 20)
                    .background(theme.holo(0.06), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(theme.holo(0.3)))
                VStack(alignment: .leading, spacing: 1) {
                    Text(opt.label).font(Typeface.ui(14, .semibold)).foregroundStyle(theme.text)
                    if let d = opt.description, !d.isEmpty {
                        Text(d).font(Typeface.ui(12)).foregroundStyle(theme.textDim)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 10).padding(.horizontal, 12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(theme.holo(picked ? 0.2 : 0.04), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(theme.holo(picked ? 0.7 : 0.2)))
        }
        .buttonStyle(.plain)
    }

    private var otherRow: some View {
        HStack(spacing: 11) {
            Image(systemName: "arrow.turn.down.right")
                .font(.system(size: 10, weight: .bold)).foregroundStyle(theme.textDim)
                .frame(width: 20, height: 20)
                .background(theme.holo(0.06), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 5, style: .continuous).strokeBorder(theme.holo(0.3)))
            TextField("Something else…", text: otherBinding)
                .font(Typeface.ui(13.5)).foregroundStyle(theme.text).tint(theme.holo())
                .submitLabel(.done)
                .onSubmit { if !currentOther.trimmingCharacters(in: .whitespaces).isEmpty { goNext() } }
        }
        .padding(.vertical, 9).padding(.horizontal, 12)
        .background(theme.holo(0.04), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(theme.holo(0.2)))
    }

    private var currentOther: String { others.indices.contains(qi) ? others[qi] : "" }

    private var otherBinding: Binding<String> {
        Binding(
            get: { currentOther },
            set: { text in
                guard others.indices.contains(qi), selections.indices.contains(qi) else { return }
                others[qi] = text
                let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
                selections[qi] = t.isEmpty ? [] : [t]
            }
        )
    }

    private var reviewStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Submit your answers?").font(Typeface.display(19)).foregroundStyle(theme.text)
            VStack(spacing: 6) {
                ForEach(Array(items.enumerated()), id: \.element.id) { i, it in
                    Button { reviewing = false; qi = i } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(it.question).font(Typeface.ui(11)).foregroundStyle(theme.textDim)
                            Text(answerText(i)).font(Typeface.ui(14, .semibold)).foregroundStyle(theme.text)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.vertical, 8).padding(.horizontal, 11)
                        .background(theme.holo(0.04), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(theme.holo(0.16)))
                    }
                    .buttonStyle(.plain)
                }
            }
            PrimaryCardButton(title: "SUBMIT", action: submit)
        }
    }

    private func answerText(_ i: Int) -> String {
        guard selections.indices.contains(i), !selections[i].isEmpty else { return "—" }
        return selections[i].joined(separator: ", ")
    }

    private func isPicked(_ label: String) -> Bool {
        selections.indices.contains(qi) && selections[qi].contains(label)
    }

    private func pickOption(_ idx: Int) {
        guard let it = item, selections.indices.contains(qi), it.options.indices.contains(idx) else { return }
        let label = it.options[idx].label
        if it.multi ?? false {
            var cur = selections[qi]
            if let j = cur.firstIndex(of: label) { cur.remove(at: j) } else { cur.append(label) }
            selections[qi] = cur
        } else {
            selections[qi] = [label]
            if others.indices.contains(qi) { others[qi] = "" }
            goNext()
        }
    }

    private func goNext() {
        if single { submit(); return }
        if qi < items.count - 1 { qi += 1 } else { reviewing = true }
    }

    private func submit() { onSubmit(selections.map { $0 }) }
}

// MARK: - ProjectApprovalCard

/// The plan-approval decision: title/goal + a budget ceiling (default est * 1.5,
/// floored at 1). Run launches with that budget; Cancel drops the project.
struct ProjectApprovalCard: View {
    @Environment(\.theme) private var theme
    let project: Project
    let store: NeroStore
    @State private var budget = ""

    private var est: Double { project.est_cost_usd ?? 0 }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Circle().fill(theme.holo()).frame(width: 6, height: 6).shadow(color: theme.holo(0.8), radius: 3)
                CardChip(text: "Nero · Plan")
                Spacer()
                Button { cancel() } label: {
                    Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(theme.textFaint)
                }
            }
            Text(project.title ?? "Untitled")
                .font(Typeface.display(20)).foregroundStyle(theme.text)
                .fixedSize(horizontal: false, vertical: true)
            if let g = project.goal, !g.isEmpty {
                Text(g).font(Typeface.ui(13)).foregroundStyle(theme.textDim)
                    .fixedSize(horizontal: false, vertical: true)
            }
            budgetRow
            HStack(spacing: 8) {
                GhostCardButton(title: "Cancel", action: cancel)
                PrimaryCardButton(title: "RUN IT", action: run, enabled: (Double(budget) ?? 0) > 0)
            }
        }
        .padding(16)
        .glass(radius: 18, strokeAlpha: 0.28)
        .onAppear(perform: initBudget)
        .onChange(of: project.id) { _, _ in initBudget() }
    }

    private var budgetRow: some View {
        HStack(spacing: 11) {
            Text("BUDGET CEILING").font(Typeface.mono(10)).tracking(1).foregroundStyle(theme.textDim)
            Spacer()
            HStack(spacing: 2) {
                Text("$").font(Typeface.mono(15)).foregroundStyle(theme.textDim)
                TextField("0", text: $budget)
                    .font(Typeface.mono(16)).foregroundStyle(theme.text).tint(theme.holo())
                    .keyboardType(.decimalPad)
                    .multilineTextAlignment(.trailing)
                    .frame(width: 74)
            }
            .overlay(alignment: .bottom) { Rectangle().fill(theme.holo(0.4)).frame(height: 1) }
            Text("est $\(String(format: "%.2f", est))").font(Typeface.mono(11)).foregroundStyle(theme.textFaint)
        }
        .padding(.vertical, 10).padding(.horizontal, 12)
        .background(theme.holo(0.05), in: RoundedRectangle(cornerRadius: 9, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(theme.holo(0.2)))
    }

    private func initBudget() {
        let e = est
        let b = e > 0 ? max((e * 1.5 * 100).rounded(.up) / 100, 1) : 5
        budget = String(format: "%.2f", b)
    }

    private func run() {
        let b = Double(budget) ?? 0
        guard b > 0 else { return }
        Task { await store.client.projectAction(project.id, "approve", body: ["action": "run", "budgetUsd": b]) }
    }

    private func cancel() {
        // Reject through /approve so the waiting plan tool is unblocked (a bare
        // /cancel just marks it cancelled and leaves the turn hanging).
        Task { await store.client.projectAction(project.id, "approve", body: ["action": "cancel"]) }
    }
}

// MARK: - ProjectDashboardCard

/// A compact live card for a running/paused/done project: spend/budget meter, task
/// progress, the running task's title + streaming tail, and lifecycle controls.
struct ProjectDashboardCard: View {
    @Environment(\.theme) private var theme
    let project: Project
    let tasks: [ProjectTask]
    let store: NeroStore

    private var ordered: [ProjectTask] { tasks.sorted { ($0.idx ?? 0) < ($1.idx ?? 0) } }
    private var spent: Double { project.spent_usd ?? 0 }
    private var budget: Double { project.budget_usd ?? 0 }
    private var pct: Double { budget > 0 ? min(1, spent / budget) : 0 }
    private var doneCount: Int { ordered.filter { $0.status == "done" }.count }
    private var running: ProjectTask? { ordered.first { $0.status == "running" } }
    private var near: Bool { pct >= 0.8 }
    private var status: String { project.status ?? "" }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            header
            meter
            if let r = running {
                VStack(alignment: .leading, spacing: 2) {
                    Text(r.title ?? "…").font(Typeface.ui(12.5)).foregroundStyle(theme.text)
                        .lineLimit(1)
                    if let tail = liveTail(r), !tail.isEmpty {
                        Text(tail).font(Typeface.mono(10)).foregroundStyle(theme.textFaint).lineLimit(1)
                    }
                }
            }
            if status == "paused" {
                Text("Paused at the budget. Resume to keep going.")
                    .font(Typeface.ui(11.5)).foregroundStyle(theme.textDim)
            }
            if status == "error", let e = project.error, !e.isEmpty {
                Text(e).font(Typeface.ui(11.5)).foregroundStyle(Color(hex: 0xe7674a)).lineLimit(3)
            }
            actions
        }
        .padding(13)
        .glass(radius: 13, strokeAlpha: 0.24)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(status == "running" ? theme.holo() : theme.holo(0.5))
                .frame(width: 6, height: 6)
                .shadow(color: status == "running" ? theme.holo(0.8) : .clear, radius: 3)
            Text(project.title ?? "Project").font(Typeface.display(14)).foregroundStyle(theme.text).lineLimit(1)
            Spacer(minLength: 6)
            Text(status.uppercased())
                .font(Typeface.mono(9)).tracking(0.8).foregroundStyle(statusColor)
                .padding(.horizontal, 6).padding(.vertical, 2)
                .overlay(Capsule().strokeBorder(statusColor.opacity(0.4)))
            Button { Task { await store.client.projectAction(project.id, "dismiss") } } label: {
                Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(theme.textFaint)
            }
        }
    }

    private var statusColor: Color {
        switch status {
        case "running": return theme.text
        case "paused": return Color(hex: 0xe7b34a)
        case "error": return Color(hex: 0xe7674a)
        case "done": return Color(hex: 0x4ae08a)
        default: return theme.textDim
        }
    }

    private var meter: some View {
        HStack(spacing: 9) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(theme.holo(0.12))
                    Capsule().fill(near ? Color(hex: 0xe7b34a) : theme.holo())
                        .frame(width: max(2, geo.size.width * pct))
                }
            }
            .frame(height: 4)
            Text("$\(String(format: "%.3f", spent))" + (budget > 0 ? " / $\(String(format: "%.2f", budget))" : ""))
                .font(Typeface.mono(10.5)).foregroundStyle(theme.textDim)
            Text("\(doneCount)/\(ordered.count)").font(Typeface.mono(10.5)).foregroundStyle(theme.textFaint)
        }
    }

    private var actions: some View {
        HStack(spacing: 7) {
            switch status {
            case "running":
                GhostCardButton(title: "Pause") { act("pause") }
                GhostCardButton(title: "Stop", action: { act("cancel") }, danger: true)
            case "paused":
                PrimaryCardButton(title: "RESUME", action: { act("resume") })
                GhostCardButton(title: "Stop", action: { act("cancel") }, danger: true)
            default:
                GhostCardButton(title: "Dismiss") { act("dismiss") }
            }
        }
    }

    private func act(_ action: String) {
        Task { await store.client.projectAction(project.id, action) }
    }

    private func liveTail(_ t: ProjectTask) -> String? {
        guard let s = t.streaming_text?.trimmingCharacters(in: .whitespacesAndNewlines), !s.isEmpty else { return nil }
        let last = s.split(separator: "\n").last.map(String.init) ?? s
        return String(last.suffix(80))
    }
}

// MARK: - MergeApprovalCard

/// Shown when a project has a staged merge-conflict resolution: the conflicted
/// files and the proposed diff, with approve/reject to unblock the merge lane.
struct MergeApprovalCard: View {
    @Environment(\.theme) private var theme
    let project: Project
    let store: NeroStore

    private var conflict: MergeConflict? { project.merge_conflict }

    var body: some View {
        if let c = conflict {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Circle().fill(Color(hex: 0xe7b34a)).frame(width: 7, height: 7).shadow(color: Color(hex: 0xe7b34a).opacity(0.8), radius: 3)
                    Text("MERGE CONFLICT").font(Typeface.mono(10)).tracking(1.4).foregroundStyle(Color(hex: 0xe7b34a))
                    Spacer()
                    Text("\(c.files?.count ?? 0) files").font(Typeface.mono(10)).foregroundStyle(theme.textFaint)
                }
                Text(project.title ?? "Untitled").font(Typeface.display(18)).foregroundStyle(theme.text)
                Text("Task \(c.task_title ?? "?") conflicted with the integration branch. Nero staged a resolution, review it before it commits.")
                    .font(Typeface.ui(13)).foregroundStyle(theme.textDim)
                    .fixedSize(horizontal: false, vertical: true)
                if let files = c.files, !files.isEmpty {
                    VStack(alignment: .leading, spacing: 3) {
                        ForEach(files, id: \.self) { f in
                            Text(f).font(Typeface.mono(11.5)).foregroundStyle(theme.text)
                        }
                    }
                }
                Text("PROPOSED RESOLUTION").font(Typeface.mono(9.5)).tracking(1.2).foregroundStyle(theme.textFaint)
                ScrollView([.horizontal, .vertical]) {
                    Text(c.diff?.isEmpty == false ? c.diff! : "(no diff)")
                        .font(Typeface.mono(11.5)).foregroundStyle(theme.text)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .textSelection(.enabled)
                }
                .frame(maxHeight: 260)
                .padding(11)
                .background(Color.black.opacity(0.28), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).strokeBorder(theme.holo(0.12)))
                HStack(spacing: 8) {
                    PrimaryCardButton(title: "APPROVE MERGE") { merge("approve") }
                    GhostCardButton(title: "Reject", action: { merge("reject") }, danger: true)
                }
            }
            .padding(16)
            .glass(radius: 18, strokeAlpha: 0.28)
        }
    }

    private func merge(_ action: String) {
        Task { await store.client.projectAction(project.id, "merge-approve", body: ["action": action]) }
    }
}
