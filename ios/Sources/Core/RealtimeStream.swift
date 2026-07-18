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

                    var event = "message"
                    var data = ""
                    // Flush on a blank line (spec) OR on the next `event:` — Swift's
                    // `bytes.lines` doesn't reliably yield the blank separator, so
                    // relying on it alone drops every event.
                    for try await line in bytes.lines {
                        if line.isEmpty {
                            if !data.isEmpty { Self.emit(event, data, onEvent); data = ""; event = "message" }
                        } else if line.hasPrefix("event:") {
                            if !data.isEmpty { Self.emit(event, data, onEvent); data = "" }
                            event = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
                        } else if line.hasPrefix("data:") {
                            let chunk = String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces)
                            data += data.isEmpty ? chunk : "\n" + chunk
                        }
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
