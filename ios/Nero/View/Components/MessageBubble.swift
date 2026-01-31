import SwiftUI

struct MessageBubble: View {
    let message: Message

    @State private var appeared = false

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            avatar

            VStack(alignment: .leading, spacing: 6) {
                messageContent

                Text(formatTime(message.createdAt))
                    .font(.system(size: 10, weight: .medium, design: .monospaced))
                    .foregroundColor(.nMutedForeground)
            }
        }
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared ? 0 : 12)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                appeared = true
            }
        }
    }

    @ViewBuilder
    private var avatar: some View {
        if message.role == .user {
            userAvatar
        } else {
            neroAvatar
        }
    }

    private var neroAvatar: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Color.neroBlue.opacity(0.2), Color.neroCyan.opacity(0.1)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 32, height: 32)

            Circle()
                .stroke(Color.neroBlue.opacity(0.4), lineWidth: 1)
                .frame(width: 32, height: 32)

            Text("N")
                .font(.system(size: 16, weight: .bold, design: .rounded))
                .foregroundStyle(LinearGradient.neroGradient)
        }
        .shadow(color: .neroBlue.opacity(0.3), radius: 4)
    }

    private var userAvatar: some View {
        ZStack {
            Circle()
                .fill(
                    LinearGradient(
                        colors: [Color.neroBlue.opacity(0.3), Color.neroBlue.opacity(0.15)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 32, height: 32)

            Circle()
                .stroke(Color.neroBlue.opacity(0.5), lineWidth: 1)
                .frame(width: 32, height: 32)

            Image(systemName: "person.fill")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.neroBlue)
        }
        .shadow(color: .neroBlue.opacity(0.2), radius: 4)
    }

    @ViewBuilder
    private var messageContent: some View {
        if message.role == .user {
            userMessageContent
        } else {
            assistantMessageContent
        }
    }

    private var userMessageContent: some View {
        Text(message.content)
            .font(.system(size: 15, weight: .regular))
            .textSelection(.enabled)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .foregroundColor(.white)
            .background(
                LinearGradient(
                    stops: [
                        .init(color: Color.neroBlue.opacity(0.25), location: 0),
                        .init(color: Color.neroBlue.opacity(0.15), location: 1)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(
                        LinearGradient(
                            colors: [
                                Color.neroBlue.opacity(0.4),
                                Color.neroCyan.opacity(0.2)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            )
            .shadow(color: Color.neroBlue.opacity(0.15), radius: 8, x: 0, y: 4)
            .contextMenu {
                Button {
                    UIPasteboard.general.string = message.content
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
            }
    }

    private var assistantMessageContent: some View {
        MarkdownView(message.content, isUser: false)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .foregroundColor(.white.opacity(0.95))
            .background(
                ZStack {
                    Color.nCard

                    LinearGradient(
                        colors: [Color.neroBlue.opacity(0.06), Color.clear],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(
                        LinearGradient(
                            colors: [
                                Color.neroBlue.opacity(0.25),
                                Color.neroBlue.opacity(0.1),
                                Color.neroCyan.opacity(0.15)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            )
            .shadow(color: Color.black.opacity(0.3), radius: 6, x: 0, y: 4)
            .contextMenu {
                Button {
                    UIPasteboard.general.string = message.content
                } label: {
                    Label("Copy", systemImage: "doc.on.doc")
                }
            }
    }

    private func formatTime(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: date)
    }
}

#Preview {
    ZStack {
        NeroBackgroundView()

        VStack(spacing: 16) {
            MessageBubble(
                message: Message(role: .user, content: "Hello, Nero!")
            )
            MessageBubble(
                message: Message(role: .assistant, content: """
                Hey! Here's what I found:

                - `SUPABASE_PROJECT_URL`
                - `SUPABASE_SECRET_KEY`

                ```swift
                func test() {
                    print("Hello!")
                }
                ```

                Let me know if you need anything else!
                """)
            )
        }
        .padding()
    }
}
