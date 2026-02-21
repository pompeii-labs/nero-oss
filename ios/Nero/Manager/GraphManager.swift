import Foundation

@MainActor
class GraphManager: ObservableObject {
    static let shared = GraphManager()

    @Published var graphData: GraphData?
    @Published var toolFires: [ToolFire] = []

    private var pollTimer: Timer?
    private var toolSeq = 0

    private init() {}

    func fireToolName(_ name: String) {
        let entry = ToolFire(name: name, seq: toolSeq)
        toolSeq += 1
        toolFires.append(entry)

        let seq = entry.seq
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            toolFires.removeAll { $0.seq == seq }
        }
    }

    func startPolling() {
        guard pollTimer == nil else { return }
        Task { await refresh() }
        pollTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                await self?.refresh()
            }
        }
    }

    func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    func refresh() async {
        do {
            graphData = try await APIManager.shared.getGraph()
        } catch {}
    }
}
