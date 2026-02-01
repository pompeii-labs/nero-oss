import SwiftUI
import Combine

struct ChatView: View {
    @Binding var showMenu: Bool

    @StateObject private var viewModel = ChatViewModel()
    @EnvironmentObject var toastManager: ToastManager

    @StateObject private var keyboard = KeyboardObserver()
    @FocusState private var isInputFocused: Bool
    @State private var shouldScroll = false

    var body: some View {
        NavigationStack {
            ZStack {
                NeroBackgroundView()

                VStack(spacing: 0) {
                    timelineView

                    inputBar
                        .padding(.horizontal, 16)
                        .padding(.bottom, 12)
                }

                if viewModel.pendingPermission != nil {
                    permissionOverlay
                }
            }
            .navigationTitle("Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.nBackground.opacity(0.9), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button {
                        showMenu = true
                    } label: {
                        Image(systemName: "line.3.horizontal")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundStyle(LinearGradient.neroGradient)
                    }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 16) {
                        if viewModel.isLoading {
                            Button {
                                Task { await viewModel.abort() }
                            } label: {
                                Text("Stop")
                                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                                    .foregroundColor(.nError)
                            }
                        }

                        Menu {
                            Button {
                                Task { await clearConversation() }
                            } label: {
                                Label("Clear Conversation", systemImage: "trash")
                            }

                            Button {
                                Task { await viewModel.loadHistory() }
                            } label: {
                                Label("Refresh", systemImage: "arrow.clockwise")
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .foregroundColor(.nMutedForeground)
                        }
                    }
                }
            }
        }
        .task {
            await viewModel.loadHistory()
        }
    }

    private var timelineView: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    ForEach(viewModel.timeline) { item in
                        switch item {
                        case .message(let message):
                            MessageBubble(message: message)
                                .id(item.id)
                        case .activity(let activity):
                            ToolActivityCard(activity: activity)
                                .id(item.id)
                        }
                    }

                    if viewModel.isLoading {
                        TypingIndicator()
                            .id("typing")
                            .transition(.blurReplace)
                    }

                    Color.clear
                        .frame(height: 1)
                        .id("bottom")
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 8)
            }
            .scrollDismissesKeyboard(.interactively)
            .onTapGesture {
                isInputFocused = false
            }
            .onAppear {
                scrollToBottom(proxy: proxy)
            }
            .onChange(of: shouldScroll) { _, newValue in
                if newValue {
                    scrollToBottom(proxy: proxy)
                }
            }
            .onChange(of: viewModel.timeline.count) { _, _ in
                shouldScroll = true
            }
            .onChange(of: viewModel.isLoading) { _, _ in
                shouldScroll = true
            }
            .onChange(of: isInputFocused) { _, newValue in
                if newValue {
                    shouldScroll = true
                }
            }
            .onChange(of: keyboard.keyboardHeight) { _, newValue in
                if newValue > 0 {
                    shouldScroll = true
                }
            }
        }
    }

    private func scrollToBottom(proxy: ScrollViewProxy) {
        Task {
            try? await Task.sleep(nanoseconds: 100_000_000)
            withAnimation(.easeOut(duration: 0.3)) {
                proxy.scrollTo("bottom", anchor: .bottom)
            }
            shouldScroll = false
        }
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: 0) {
            TextField(
                "Ask Nero anything...",
                text: $viewModel.inputText,
                axis: .vertical
            )
            .textFieldStyle(.plain)
            .lineLimit(1...6)
            .font(.system(size: 15))
            .foregroundColor(.white)
            .padding(.leading, 20)
            .padding(.trailing, 12)
            .padding(.vertical, 16)
            .focused($isInputFocused)
            .onSubmit {
                if canSend {
                    sendMessage()
                } else {
                    isInputFocused = false
                }
            }

            Button(action: sendMessage) {
                ZStack {
                    Circle()
                        .fill(
                            canSend
                                ? LinearGradient.neroGradient
                                : LinearGradient(colors: [Color.nCard.opacity(0.8)], startPoint: .top, endPoint: .bottom)
                        )
                        .frame(width: 40, height: 40)

                    Image(systemName: "arrow.up")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(canSend ? .white : .nMutedForeground)
                }
                .shadow(color: canSend ? Color.neroBlue.opacity(0.5) : .clear, radius: 8)
            }
            .disabled(!canSend || viewModel.isLoading)
            .padding(.trailing, 8)
            .padding(.bottom, 8)
        }
        .background(
            ZStack {
                RoundedRectangle(cornerRadius: 24)
                    .fill(Color.nCard)

                RoundedRectangle(cornerRadius: 24)
                    .fill(
                        LinearGradient(
                            colors: [Color.neroBlue.opacity(0.05), Color.clear],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
            }
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24)
                .stroke(
                    isInputFocused
                        ? LinearGradient(
                            colors: [Color.neroBlue.opacity(0.6), Color.neroCyan.opacity(0.3)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                        : LinearGradient(
                            colors: [Color.nBorder.opacity(0.8), Color.nBorder.opacity(0.4)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                    lineWidth: 1
                )
        )
        .shadow(color: isInputFocused ? Color.neroBlue.opacity(0.3) : Color.black.opacity(0.3), radius: isInputFocused ? 16 : 10, y: 4)
        .animation(.easeInOut(duration: 0.2), value: isInputFocused)
        .animation(.easeInOut(duration: 0.15), value: canSend)
    }

    private var canSend: Bool {
        !viewModel.inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func sendMessage() {
        guard canSend else { return }

        Task {
            await viewModel.sendMessage()
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            isInputFocused = true
        }
    }

    private func clearConversation() async {
        do {
            try await APIManager.shared.clear()
            viewModel.timeline = []
            toastManager.success("Conversation cleared")
        } catch {
            toastManager.error("Failed to clear conversation")
        }
    }

    private var permissionOverlay: some View {
        ZStack {
            Color.black.opacity(0.7)
                .ignoresSafeArea()
                .onTapGesture { }

            if let permission = viewModel.pendingPermission {
                PermissionModal(
                    activity: permission.activity,
                    onApprove: {
                        Task { await viewModel.respondToPermission(approved: true) }
                    },
                    onDeny: {
                        Task { await viewModel.respondToPermission(approved: false) }
                    }
                )
                .padding(24)
                .transition(.scale(scale: 0.9).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3), value: viewModel.pendingPermission != nil)
    }
}

struct TypingIndicator: View {
    @State private var dotOffset: [CGFloat] = [0, 0, 0]

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            neroAvatar

            HStack(spacing: 5) {
                ForEach(0..<3, id: \.self) { index in
                    Circle()
                        .fill(Color.neroBlue)
                        .frame(width: 6, height: 6)
                        .offset(y: dotOffset[index])
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
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
                    .stroke(Color.nBorder, lineWidth: 1)
            )
        }
        .onAppear { startAnimation() }
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

    private func startAnimation() {
        for i in 0..<3 {
            withAnimation(
                .easeInOut(duration: 0.4)
                    .repeatForever(autoreverses: true)
                    .delay(Double(i) * 0.12)
            ) {
                dotOffset[i] = -4
            }
        }
    }
}

final class KeyboardObserver: ObservableObject {
    @Published var keyboardHeight: CGFloat = 0
    private var cancellables = Set<AnyCancellable>()

    init() {
        NotificationCenter.default.publisher(for: UIResponder.keyboardWillShowNotification)
            .merge(with: NotificationCenter.default.publisher(for: UIResponder.keyboardWillChangeFrameNotification))
            .compactMap { ($0.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect)?.height }
            .receive(on: DispatchQueue.main)
            .sink { [weak self] height in
                self?.keyboardHeight = height
            }
            .store(in: &cancellables)

        NotificationCenter.default.publisher(for: UIResponder.keyboardWillHideNotification)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] _ in
                self?.keyboardHeight = 0
            }
            .store(in: &cancellables)
    }
}

#Preview {
    ChatView(showMenu: .constant(false))
        .environmentObject(ToastManager.shared)
        .preferredColorScheme(.dark)
}
