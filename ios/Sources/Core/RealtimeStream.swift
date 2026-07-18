import Foundation

enum StreamEvent {
    case ready
    case message(ChatMessage)
    case dispatch(DispatchState)
    case panel(Data)       // decoded by the panels layer
    case question(Question)
    case project(Project)
    case task(ProjectTask)
}

/// Reads Nero's `/v1/stream` SSE feed and yields typed events, with exponential
/// backoff reconnect. SSE is parsed by hand over `URLSession.bytes`.
final class RealtimeStream {
    private var task: Task<Void, Never>?

    func connect(
        base: URL,
        onEvent: @escaping (StreamEvent) -> Void,
        onStatus: @escaping (Bool) -> Void
    ) {
        task?.cancel()
        task = Task {
            var backoff: UInt64 = 500_000_000
            while !Task.isCancelled {
                do {
                    var req = URLRequest(url: URL(string: "/v1/stream", relativeTo: base)!)
                    req.setValue("text/event-stream", forHTTPHeaderField: "accept")
                    let (bytes, resp) = try await URLSession.shared.bytes(for: req)
                    guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
                        throw URLError(.badServerResponse)
                    }
                    onStatus(true)
                    backoff = 500_000_000

                    // Parse SSE by raw bytes, dispatching each event on its `\n\n`
                    // terminator (like the browser's EventSource). `bytes.lines`
                    // withholds the trailing event until the next line arrives, so the
                    // final `done` snapshot (nothing follows it) never flushed — leaving
                    // the UI stuck "working".
                    var buf = Data()
                    for try await b in bytes {
                        buf.append(b)
                        guard b == 0x0A, buf.count >= 2,
                              buf[buf.index(buf.endIndex, offsetBy: -2)] == 0x0A else { continue }
                        let block = buf.prefix(buf.count - 2)
                        if let s = String(data: block, encoding: .utf8) { Self.process(s, onEvent) }
                        buf.removeAll(keepingCapacity: true)
                    }
                } catch {
                    onStatus(false)
                }
                if Task.isCancelled { break }
                try? await Task.sleep(nanoseconds: backoff)
                backoff = min(backoff * 2, 8_000_000_000)
            }
        }
    }

    func disconnect() {
        task?.cancel()
        task = nil
    }

    /// Parse one SSE event block (the text between `\n\n` terminators) into its
    /// `event:` type + joined `data:` payload, then emit it.
    private static func process(_ block: String, _ onEvent: (StreamEvent) -> Void) {
        var event = "message"
        var data = ""
        for raw in block.split(separator: "\n", omittingEmptySubsequences: false) {
            let line = String(raw)
            if line.hasPrefix("event:") {
                event = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                let chunk = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                data += data.isEmpty ? chunk : "\n" + chunk
            }
        }
        guard !data.isEmpty else { return }
        emit(event, data, onEvent)
    }

    private static func emit(_ event: String, _ data: String, _ onEvent: (StreamEvent) -> Void) {
        guard let d = data.data(using: .utf8) else { return }
        let dec = JSONDecoder()
        switch event {
        case "ready": onEvent(.ready)
        case "message": if let m = try? dec.decode(ChatMessage.self, from: d) { onEvent(.message(m)) }
        case "dispatch": if let x = try? dec.decode(DispatchState.self, from: d) { onEvent(.dispatch(x)) }
        case "panel": onEvent(.panel(d))
        case "question": if let q = try? dec.decode(Question.self, from: d) { onEvent(.question(q)) }
        case "project": if let p = try? dec.decode(Project.self, from: d) { onEvent(.project(p)) }
        case "task": if let t = try? dec.decode(ProjectTask.self, from: d) { onEvent(.task(t)) }
        default: break
        }
    }
}
