import SwiftUI

/// The chat surface: scrolling message list, live streaming bubble, input bar,
/// and an entry point to native voice.
struct ChatView: View {
    @ObservedObject var client: NeroClient
    let baseURL: URL?

    @State private var draft = ""
    @State private var showVoice = false
    @FocusState private var inputFocused: Bool

    private var inFlight: Bool {
        client.dispatch?.isActive ?? false
    }

    var body: some View {
        VStack(spacing: 0) {
            messageList
            Divider().overlay(Color.white.opacity(0.1))
            inputBar
        }
        .background(Color.black.ignoresSafeArea())
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    inputFocused = false
                    showVoice = true
                } label: {
                    Image(systemName: "waveform")
                }
                .disabled(baseURL == nil)
            }
        }
        .fullScreenCover(isPresented: $showVoice) {
            if let baseURL {
                VoiceView(baseURL: baseURL)
            }
        }
    }

    private var messageList: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(client.bubbles) { message in
                        MessageBubble(message: message)
                            .id("msg-\(message.id)")
                    }
                    if client.showLiveBubble, let d = client.dispatch {
                        LiveBubble(dispatch: d)
                            .id("live")
                    }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 16)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: client.bubbles.count) { scrollToBottom(proxy) }
            .onChange(of: client.dispatch) { scrollToBottom(proxy) }
            .onChange(of: client.backfilled) { scrollToBottom(proxy) }
            .overlay(alignment: .top) {
                if !client.connected {
                    Text("Connecting…")
                        .font(.caption)
                        .padding(.horizontal, 12).padding(.vertical, 6)
                        .background(.ultraThinMaterial, in: Capsule())
                        .padding(.top, 8)
                }
            }
        }
    }

    private var inputBar: some View {
        HStack(spacing: 10) {
            TextField("Message Nero…", text: $draft, axis: .vertical)
                .lineLimit(1...5)
                .focused($inputFocused)
                .padding(.horizontal, 14).padding(.vertical, 9)
                .background(.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 20))
                .foregroundStyle(.white)
                .submitLabel(.send)

            if inFlight {
                Button(action: stop) {
                    Image(systemName: "stop.fill")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 40, height: 40)
                        .background(Color.red.opacity(0.85), in: Circle())
                }
            } else {
                Button(action: sendDraft) {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(.black)
                        .frame(width: 40, height: 40)
                        .background(canSend ? Color.white : Color.gray.opacity(0.4), in: Circle())
                }
                .disabled(!canSend)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.black)
    }

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func sendDraft() {
        let text = draft
        draft = ""
        Task { await client.send(text) }
    }

    private func stop() {
        Task { await client.cancel() }
    }

    private func scrollToBottom(_ proxy: ScrollViewProxy) {
        withAnimation(.easeOut(duration: 0.2)) {
            proxy.scrollTo("bottom", anchor: .bottom)
        }
    }
}

/// A persisted user/assistant bubble.
struct MessageBubble: View {
    let message: ChatMessage

    var body: some View {
        HStack {
            if message.isUser { Spacer(minLength: 40) }
            Text(rendered)
                .foregroundStyle(message.isUser ? Color.black : Color.white)
                .padding(.horizontal, 14).padding(.vertical, 10)
                .background(
                    message.isUser ? AnyShapeStyle(Color.white)
                                   : AnyShapeStyle(Color.white.opacity(0.1)),
                    in: RoundedRectangle(cornerRadius: 18)
                )
                .textSelection(.enabled)
            if !message.isUser { Spacer(minLength: 40) }
        }
    }

    private var rendered: AttributedString {
        let raw = message.content ?? ""
        let opts = AttributedString.MarkdownParsingOptions(
            interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: raw, options: opts)) ?? AttributedString(raw)
    }
}

/// The live assistant bubble while a dispatch is in flight: streaming text + tool chips.
struct LiveBubble: View {
    let dispatch: Dispatch

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 8) {
                let activities = dispatch.activities ?? []
                if !activities.isEmpty {
                    FlowChips(activities: activities)
                }
                let text = dispatch.streaming_text ?? ""
                if text.isEmpty {
                    ThinkingDots()
                } else {
                    Text(text)
                        .foregroundStyle(.white)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 18))
            Spacer(minLength: 40)
        }
    }
}

/// Simple wrapping row of tool chips.
struct FlowChips: View {
    let activities: [Activity]

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            ForEach(activities) { ToolChip(activity: $0) }
        }
    }
}

struct ToolChip: View {
    let activity: Activity

    var body: some View {
        HStack(spacing: 6) {
            icon
            Text(activity.label)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.85))
                .lineLimit(1)
        }
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(Color.white.opacity(0.08), in: Capsule())
    }

    @ViewBuilder private var icon: some View {
        switch activity.status {
        case "running":
            ProgressView().controlSize(.mini).tint(.white)
        case "success":
            Image(systemName: "checkmark.circle.fill")
                .font(.caption2).foregroundStyle(.green)
        case "error":
            Image(systemName: "xmark.circle.fill")
                .font(.caption2).foregroundStyle(.red)
        default:
            Image(systemName: "wrench.and.screwdriver")
                .font(.caption2).foregroundStyle(.white.opacity(0.7))
        }
    }
}

/// Animated "thinking" indicator for an empty streaming bubble.
struct ThinkingDots: View {
    @State private var phase = 0.0

    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { i in
                Circle()
                    .fill(Color.white.opacity(0.7))
                    .frame(width: 6, height: 6)
                    .scaleEffect(scale(for: i))
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                phase = 1
            }
        }
    }

    private func scale(for i: Int) -> CGFloat {
        let base = sin((phase * .pi) + Double(i) * 0.6)
        return 0.7 + 0.3 * CGFloat(max(0, base))
    }
}
