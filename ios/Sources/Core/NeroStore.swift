import Foundation
import SwiftUI

/// Owns the realtime connection and all Field state. Views observe it; writes go
/// through `client`. Rows arrive as `event`s and are upserted by id.
@MainActor
final class NeroStore: ObservableObject {
    @Published private(set) var connected = false
    @Published private(set) var messages: [ChatMessage] = []
    @Published private(set) var dispatch: DispatchState?
    @Published private(set) var questions: [Question] = []
    @Published private(set) var projects: [Project] = []
    @Published private(set) var tasks: [ProjectTask] = []
    @Published private(set) var panels: [Panel] = []
    /// Tool activity captured per dispatch so it stays grouped with the finished
    /// message in scrollback (the dispatch row loses them once the turn ends).
    @Published private(set) var toolsByDispatch: [String: [Activity]] = [:]

    let client: NeroClient
    private let stream = RealtimeStream()

    init(base: URL) { client = NeroClient(base: base) }

    func start() {
        stream.connect(
            base: client.base,
            onEvent: { [weak self] ev in Task { @MainActor in self?.apply(ev) } },
            onStatus: { [weak self] c in Task { @MainActor in self?.connected = c } }
        )
    }
    func stop() { stream.disconnect() }

    // MARK: writes
    func send(_ text: String, images: [PendingImage] = []) {
        let t = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !t.isEmpty || !images.isEmpty else { return }
        let uploads = images.map { NeroClient.Upload(data: $0.data, mime: $0.mime, name: $0.name) }
        Task { try? await client.send(t, attachments: uploads) }
    }
    func cancel() { Task { await client.cancel() } }

    /// The in-flight assistant bubble: the active dispatch, unless a persisted
    /// assistant message for it already landed (then the message takes over).
    /// A project that's in-flight — surfaced via the top-bar indicator + sheet.
    /// Excludes awaiting_approval (that docks as an approval card) and dismissed ones.
    var activeProject: Project? {
        projects.first { ["planning", "running", "paused"].contains($0.status ?? "") && $0.dismissed != true }
    }
    func projectTasks(for project: Project) -> [ProjectTask] {
        tasks.filter { $0.project_id == project.id }
    }

    var liveDispatch: DispatchState? {
        guard let d = dispatch else { return nil }
        // While the turn is in-flight, always surface it (status + tool cards).
        if d.isActive { return d }
        // Done, but the persisted assistant message hasn't landed yet: keep showing the
        // trailing streaming bubble until it does (avoids a flash of empty then dupe).
        if !(d.streaming_text ?? "").isEmpty,
           !messages.contains(where: { $0.dispatch_id == d.id && $0.isAssistant }) { return d }
        return nil
    }

    // MARK: event application
    private func apply(_ ev: StreamEvent) {
        switch ev {
        case .ready: break
        case .message(let m): upsertMessage(m)
        case .dispatch(let d):
            dispatch = d
            if let acts = d.activities, !acts.isEmpty { toolsByDispatch[d.id] = acts }
        case .question(let q): upsert(&questions, q)
        case .project(let p): upsert(&projects, p)
        case .task(let t): upsert(&tasks, t)
        case .panel(let data):
            if let p = try? JSONDecoder().decode(Panel.self, from: data) { upsert(&panels, p) }
        }
    }

    private func upsertMessage(_ m: ChatMessage) {
        if let i = messages.firstIndex(where: { $0.id == m.id }) { messages[i] = m }
        else {
            messages.append(m)
            messages.sort { $0.id < $1.id }
        }
    }

    private func upsert<T: Identifiable & Equatable>(_ arr: inout [T], _ row: T) {
        if let i = arr.firstIndex(where: { $0.id == row.id }) {
            if arr[i] != row { arr[i] = row }
        } else {
            arr.append(row)
        }
    }
}
