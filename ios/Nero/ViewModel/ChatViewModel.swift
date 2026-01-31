import SwiftUI

@MainActor
class ChatViewModel: ObservableObject {
    @Published var messages: [Message] = []
    @Published var activities: [ToolActivity] = []
    @Published var pendingPermission: PermissionRequest?
    @Published var isLoading = false
    @Published var inputText = ""

    private var streamTask: Task<Void, Never>?
    private var streamingIndex: Int?

    func loadHistory() async {
        do {
            let loadedMessages = try await APIManager.shared.getHistory()
            withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) {
                messages = loadedMessages
            }
        } catch {
            print("Failed to load history: \(error)")
        }
    }

    func sendMessage() async {
        let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        inputText = ""
        activities = []

        let userMessage = Message(role: .user, content: text)
        withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
            messages.append(userMessage)
        }

        isLoading = true

        streamTask = Task {
            do {
                for try await event in APIManager.shared.streamChat(message: text) {
                    if Task.isCancelled { break }

                    switch event {
                    case .chunk(let chunk):
                        if let idx = streamingIndex {
                            messages[idx].content += chunk
                        } else {
                            let assistantMessage = Message(role: .assistant, content: chunk)
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                messages.append(assistantMessage)
                            }
                            streamingIndex = messages.count - 1
                        }

                    case .activity(let activity):
                        updateActivity(activity)

                    case .permission(let id, let activity):
                        pendingPermission = PermissionRequest(id: id, activity: activity)
                        updateActivity(activity)

                    case .done(let content):
                        if let idx = streamingIndex {
                            messages[idx].content = content
                        } else if !content.isEmpty {
                            let assistantMessage = Message(role: .assistant, content: content)
                            messages.append(assistantMessage)
                        }

                    case .error(let errorMsg):
                        if let idx = streamingIndex {
                            messages[idx].content = "Error: \(errorMsg)"
                        } else {
                            let assistantMessage = Message(role: .assistant, content: "Error: \(errorMsg)")
                            messages.append(assistantMessage)
                        }
                    }
                }
            } catch {
                if !Task.isCancelled {
                    if let idx = streamingIndex {
                        messages[idx].content = "Error: \(error.localizedDescription)"
                    } else {
                        let assistantMessage = Message(role: .assistant, content: "Error: \(error.localizedDescription)")
                        messages.append(assistantMessage)
                    }
                }
            }

            streamingIndex = nil
            isLoading = false
        }
    }

    func respondToPermission(approved: Bool) async {
        guard let permission = pendingPermission else { return }

        do {
            try await APIManager.shared.respondToPermission(id: permission.id, approved: approved)

            if let index = activities.firstIndex(where: { $0.id == permission.activity.id }) {
                activities[index].status = approved ? .approved : .denied
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

        streamingIndex = nil
        isLoading = false
    }

    private func updateActivity(_ activity: ToolActivity) {
        if let index = activities.firstIndex(where: { $0.id == activity.id }) {
            activities[index] = activity
        } else {
            activities.append(activity)
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 5) { [weak self] in
            self?.activities.removeAll { $0.id == activity.id && $0.status == .complete }
        }
    }
}
