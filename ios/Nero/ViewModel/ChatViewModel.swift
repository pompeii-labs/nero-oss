import SwiftUI

@MainActor
class ChatViewModel: ObservableObject {
    @Published var timeline: [TimelineItem] = []
    @Published var pendingPermission: PermissionRequest?
    @Published var isLoading = false
    @Published var inputText = ""

    private var streamTask: Task<Void, Never>?
    private var streamingMessageId: String?

    func loadHistory() async {
        do {
            let loadedMessages = try await APIManager.shared.getHistory()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                timeline = loadedMessages.map { .message($0) }
            }
        } catch {
            print("Failed to load history: \(error)")
        }
    }

    func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        inputText = ""

        let userMessage = Message(role: .user, content: text)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            timeline.append(.message(userMessage))
        }

        isLoading = true

        streamTask = Task {
            do {
                for try await event in APIManager.shared.streamChat(message: text) {
                    if Task.isCancelled { break }

                    switch event {
                    case .chunk(let chunk):
                        if let msgId = streamingMessageId,
                           let idx = timeline.firstIndex(where: { $0.id == "msg-\(msgId)" }),
                           case .message(var msg) = timeline[idx] {
                            msg.content += chunk
                            timeline[idx] = .message(msg)
                        } else {
                            let assistantMessage = Message(role: .assistant, content: chunk)
                            streamingMessageId = assistantMessage.id
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                timeline.append(.message(assistantMessage))
                            }
                        }

                    case .activity(let activity):
                        updateActivity(activity)

                    case .permission(let id, let activity):
                        pendingPermission = PermissionRequest(id: id, activity: activity)
                        updateActivity(activity)

                    case .done(let content):
                        if let msgId = streamingMessageId,
                           let idx = timeline.firstIndex(where: { $0.id == "msg-\(msgId)" }),
                           case .message(var msg) = timeline[idx] {
                            msg.content = content
                            timeline[idx] = .message(msg)
                        } else if !content.isEmpty {
                            let assistantMessage = Message(role: .assistant, content: content)
                            timeline.append(.message(assistantMessage))
                        }

                    case .error(let errorMsg):
                        if let msgId = streamingMessageId,
                           let idx = timeline.firstIndex(where: { $0.id == "msg-\(msgId)" }),
                           case .message(var msg) = timeline[idx] {
                            msg.content = "Error: \(errorMsg)"
                            timeline[idx] = .message(msg)
                        } else {
                            let assistantMessage = Message(role: .assistant, content: "Error: \(errorMsg)")
                            timeline.append(.message(assistantMessage))
                        }
                    }
                }
            } catch {
                if !Task.isCancelled {
                    if let msgId = streamingMessageId,
                       let idx = timeline.firstIndex(where: { $0.id == "msg-\(msgId)" }),
                       case .message(var msg) = timeline[idx] {
                        msg.content = "Error: \(error.localizedDescription)"
                        timeline[idx] = .message(msg)
                    } else {
                        let assistantMessage = Message(role: .assistant, content: "Error: \(error.localizedDescription)")
                        timeline.append(.message(assistantMessage))
                    }
                }
            }

            streamingMessageId = nil
            isLoading = false
        }
    }

    func respondToPermission(approved: Bool) async {
        guard let permission = pendingPermission else { return }

        do {
            try await APIManager.shared.respondToPermission(id: permission.id, approved: approved)

            if let index = timeline.firstIndex(where: { $0.id == "act-\(permission.activity.id)" }),
               case .activity(var activity) = timeline[index] {
                activity.status = approved ? .approved : .denied
                timeline[index] = .activity(activity)
            }
        } catch {
            print("Failed to respond to permission: \(error)")
        }

        pendingPermission = nil
    }

    func abort() async {
        streamTask?.cancel()
        streamTask = nil

        do {
            try await APIManager.shared.abort()
        } catch {
            print("Failed to abort: \(error)")
        }

        streamingMessageId = nil
        isLoading = false
    }

    private func updateActivity(_ activity: ToolActivity) {
        if let index = timeline.firstIndex(where: { $0.id == "act-\(activity.id)" }) {
            timeline[index] = .activity(activity)
        } else {
            timeline.append(.activity(activity))
        }
    }
}
