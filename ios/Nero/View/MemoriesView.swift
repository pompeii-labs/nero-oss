import SwiftUI

struct MemoriesView: View {
    @Binding var showMenu: Bool

    @EnvironmentObject var neroManager: NeroManager
    @EnvironmentObject var toastManager: ToastManager
    @EnvironmentObject var tabRouter: TabRouter
    @State private var memories: [Memory] = []
    @State private var isLoading = true
    @State private var showAddMemory = false
    @State private var newMemoryText = ""

    var body: some View {
        NavigationStack {
            ZStack {
                NeroBackgroundView()

                if !neroManager.isConnected {
                    disconnectedState
                        .floatUp()
                } else if isLoading {
                    VStack(spacing: 16) {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .neroBlue))
                            .scaleEffect(1.2)
                        Text("Loading memories...")
                            .font(.subheadline)
                            .foregroundColor(.nMutedForeground)
                    }
                    .floatUp()
                } else if memories.isEmpty {
                    emptyState
                        .floatUp()
                } else {
                    memoryList
                }
            }
            .navigationTitle("Memories")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.nBackground.opacity(0.8), for: .navigationBar)
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

                if neroManager.isConnected {
                    ToolbarItem(placement: .navigationBarTrailing) {
                        Button {
                            showAddMemory = true
                        } label: {
                            Image(systemName: "plus")
                                .foregroundStyle(LinearGradient.neroGradient)
                        }
                    }
                }
            }
            .sheet(isPresented: $showAddMemory) {
                addMemorySheet
            }
        }
        .task {
            if neroManager.isConnected {
                await loadMemories()
            }
        }
        .onChange(of: neroManager.isConnected) { _, connected in
            if connected {
                Task { await loadMemories() }
            }
        }
    }

    private var disconnectedState: some View {
        VStack(spacing: 24) {
            ZStack {
                Circle()
                    .fill(Color.neroBlue.opacity(0.1))
                    .frame(width: 100, height: 100)
                    .blur(radius: 25)

                Image(systemName: "brain")
                    .font(.system(size: 44, weight: .light))
                    .foregroundStyle(LinearGradient.neroGradient)
                    .neroGlowStrong()
            }
            .holoRing()
            .frame(width: 80, height: 80)

            VStack(spacing: 8) {
                Text("Connect to load memories")
                    .font(.headline)
                    .foregroundColor(.white)

                Text("Set up a connection in Settings to view and manage memories")
                    .font(.subheadline)
                    .foregroundColor(.nMutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Button {
                tabRouter.selectedTab = .settings
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "gearshape.fill")
                    Text("Go to Settings")
                }
                .neroButton()
            }
            .padding(.horizontal, 48)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 20) {
            ZStack {
                Circle()
                    .fill(Color.neroBlue.opacity(0.1))
                    .frame(width: 100, height: 100)
                    .blur(radius: 25)

                Image(systemName: "brain")
                    .font(.system(size: 48, weight: .light))
                    .foregroundStyle(LinearGradient.neroGradient)
                    .neroGlowStrong()
            }
            .holoRing()
            .frame(width: 80, height: 80)

            VStack(spacing: 8) {
                Text("No memories yet")
                    .font(.headline)
                    .foregroundColor(.white)

                Text("Nero will remember important information from your conversations")
                    .font(.subheadline)
                    .foregroundColor(.nMutedForeground)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
        }
    }

    private var memoryList: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                ForEach(Array(memories.enumerated()), id: \.element.id) { index, memory in
                    memoryRow(memory, index: index)
                }
            }
            .padding()
        }
        .refreshable {
            await loadMemories()
        }
    }

    private func memoryRow(_ memory: Memory, index: Int) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                if memory.isCore {
                    HStack(spacing: 4) {
                        Image(systemName: "star.fill")
                            .font(.caption2)
                        Text("CORE")
                            .font(.caption2)
                            .fontWeight(.bold)
                    }
                    .foregroundColor(.neroBlue)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(
                        LinearGradient(
                            colors: [Color.neroBlue.opacity(0.2), Color.neroBlue.opacity(0.1)],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .clipShape(Capsule())
                    .overlay(
                        Capsule()
                            .stroke(Color.neroBlue.opacity(0.3), lineWidth: 1)
                    )
                }

                Spacer()

                Text(formatDate(memory.createdDate))
                    .font(.caption)
                    .foregroundColor(.nMutedForeground)
            }

            Text(memory.body)
                .font(.body)
                .foregroundColor(.white)
                .textSelection(.enabled)
        }
        .padding(16)
        .glassCard()
        .floatUp(delay: Double(index) * 0.05)
        .contextMenu {
            Button(role: .destructive) {
                deleteMemory(memory)
            } label: {
                Label("Delete", systemImage: "trash")
            }
        }
    }

    private var addMemorySheet: some View {
        NavigationStack {
            ZStack {
                NeroBackgroundView()

                VStack(spacing: 24) {
                    VStack(spacing: 8) {
                        Image(systemName: "brain.head.profile")
                            .font(.system(size: 32))
                            .foregroundStyle(LinearGradient.neroGradient)
                            .neroGlowSubtle()

                        Text("Add a memory for Nero to remember")
                            .font(.subheadline)
                            .foregroundColor(.nMutedForeground)
                    }
                    .floatUp(delay: 0)

                    TextEditor(text: $newMemoryText)
                        .scrollContentBackground(.hidden)
                        .foregroundColor(.white)
                        .padding()
                        .frame(minHeight: 140)
                        .background(
                            LinearGradient(
                                colors: [Color.nCard, Color.nCard.opacity(0.8)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(
                                    LinearGradient(
                                        colors: [Color.neroBlue.opacity(0.3), Color.nBorder],
                                        startPoint: .topLeading,
                                        endPoint: .bottomTrailing
                                    ),
                                    lineWidth: 1
                                )
                        )
                        .floatUp(delay: 0.1)

                    Button {
                        Task { await addMemory() }
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                            Text("Save Memory")
                        }
                        .neroButton()
                    }
                    .disabled(newMemoryText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .opacity(newMemoryText.isEmpty ? 0.5 : 1)
                    .floatUp(delay: 0.2)

                    Spacer()
                }
                .padding(24)
            }
            .navigationTitle("New Memory")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.nBackground.opacity(0.8), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        showAddMemory = false
                        newMemoryText = ""
                    }
                    .foregroundColor(.nMutedForeground)
                }
            }
        }
    }

    private func loadMemories() async {
        isLoading = true
        defer { isLoading = false }

        do {
            memories = try await APIManager.shared.getMemories()
        } catch {
            toastManager.error("Failed to load memories")
        }
    }

    private func deleteMemory(_ memory: Memory) {
        Task {
            do {
                try await APIManager.shared.deleteMemory(id: memory.id)
                await MainActor.run {
                    withAnimation(.spring(response: 0.3)) {
                        memories.removeAll { $0.id == memory.id }
                    }
                    toastManager.success("Memory deleted")
                }
            } catch {
                await MainActor.run {
                    toastManager.error("Failed to delete memory")
                }
            }
        }
    }

    private func addMemory() async {
        let text = newMemoryText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        do {
            let memory = try await APIManager.shared.createMemory(body: text)
            memories.insert(memory, at: 0)
            showAddMemory = false
            newMemoryText = ""
            toastManager.success("Memory saved")
        } catch {
            toastManager.error("Failed to save memory")
        }
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        return formatter.localizedString(for: date, relativeTo: Date())
    }
}

#Preview {
    MemoriesView(showMenu: .constant(false))
        .environmentObject(NeroManager.shared)
        .environmentObject(ToastManager.shared)
        .environmentObject(TabRouter())
        .preferredColorScheme(.dark)
}
