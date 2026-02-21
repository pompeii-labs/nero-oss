import SwiftUI

struct MemoriesView: View {
    @Binding var showMenu: Bool

    @EnvironmentObject var neroManager: NeroManager
    @EnvironmentObject var toastManager: ToastManager
    @EnvironmentObject var tabRouter: TabRouter
    @EnvironmentObject var graphManager: GraphManager
    @State private var selectedNodeId: Int?
    @State private var focusNodeId: Int?
    @State private var selectedNode: GraphNode?
    @State private var showAddMemory = false
    @State private var newMemoryText = ""
    @State private var searchQuery = ""
    @State private var isLoading = true

    private var filteredNodes: [GraphNode] {
        guard let data = graphManager.graphData, !searchQuery.isEmpty else { return [] }
        let query = searchQuery.lowercased()
        return data.nodes.filter {
            $0.label.lowercased().contains(query) ||
            ($0.body?.lowercased().contains(query) ?? false)
        }
    }

    private var connections: [(node: GraphNode, relation: String)] {
        guard let node = selectedNode, let data = graphManager.graphData else { return [] }
        var result: [(node: GraphNode, relation: String)] = []
        let nodeMap = Dictionary(uniqueKeysWithValues: data.nodes.map { ($0.id, $0) })

        for edge in data.edges {
            if edge.source == node.id, let target = nodeMap[edge.target] {
                result.append((node: target, relation: edge.relation))
            } else if edge.target == node.id, let source = nodeMap[edge.source] {
                result.append((node: source, relation: edge.relation))
            }
        }
        return result
    }

    var body: some View {
        NavigationStack {
            contentLayer
                .navigationTitle("Memories")
                .navigationBarTitleDisplayMode(.inline)
                .toolbarBackground(Color.nBackground.opacity(0.8), for: .navigationBar)
                .toolbarBackground(.visible, for: .navigationBar)
                .searchable(text: $searchQuery, prompt: "Search nodes...")
                .searchSuggestions { searchSuggestionsList }
                .toolbar { toolbarContent }
                .sheet(item: $selectedNode) { node in
                    nodeDetailSheet(node: node)
                }
                .sheet(isPresented: $showAddMemory) {
                    addMemorySheet
                }
        }
        .task {
            if neroManager.isConnected {
                graphManager.startPolling()
                try? await Task.sleep(nanoseconds: 500_000_000)
                isLoading = false
            }
        }
        .onDisappear {
            graphManager.stopPolling()
        }
        .onChange(of: neroManager.isConnected) { _, connected in
            if connected {
                graphManager.startPolling()
                Task {
                    try? await Task.sleep(nanoseconds: 500_000_000)
                    isLoading = false
                }
            } else {
                graphManager.stopPolling()
            }
        }
    }

    @ViewBuilder
    private var contentLayer: some View {
        ZStack {
            NeroBackgroundView()

            if !neroManager.isConnected {
                disconnectedState
                    .floatUp()
            } else if isLoading && graphManager.graphData == nil {
                loadingState
            } else if graphManager.graphData == nil || graphManager.graphData!.nodes.isEmpty {
                emptyState
                    .floatUp()
            } else {
                graphExplorer
            }
        }
    }

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: .neroBlue))
                .scaleEffect(1.2)
            Text("Loading graph...")
                .font(.subheadline)
                .foregroundColor(.nMutedForeground)
        }
        .floatUp()
    }

    private var graphExplorer: some View {
        GraphExplorerView(
            graphData: graphManager.graphData,
            selectedNodeId: $selectedNodeId,
            focusNodeId: $focusNodeId,
            onSelectNode: { id in
                handleNodeSelection(id)
            }
        )
        .ignoresSafeArea(edges: .bottom)
    }

    @ViewBuilder
    private var searchSuggestionsList: some View {
        ForEach(filteredNodes) { node in
            Button {
                selectNodeFromSearch(node)
            } label: {
                searchSuggestionRow(node: node)
            }
        }
    }

    private func searchSuggestionRow(node: GraphNode) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(nodeTypeColor(node.type))
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(node.label)
                    .font(.subheadline)
                    .foregroundColor(.white)
                Text(node.type.capitalized)
                    .font(.caption)
                    .foregroundColor(.nMutedForeground)
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
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

    private func nodeDetailSheet(node: GraphNode) -> some View {
        GraphNodePanelView(
            node: node,
            connections: connections,
            onNavigate: { id in
                navigateToNode(id: id)
            },
            onDelete: { id in
                deleteNode(id: id)
            }
        )
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Color.nBackground)
    }

    private func handleNodeSelection(_ id: Int?) {
        withAnimation(.easeInOut(duration: 0.2)) {
            selectedNodeId = id
            focusNodeId = id
            if let id = id {
                selectedNode = graphManager.graphData?.nodes.first { $0.id == id }
            } else {
                selectedNode = nil
            }
        }
    }

    private func selectNodeFromSearch(_ node: GraphNode) {
        searchQuery = ""
        selectedNodeId = node.id
        focusNodeId = node.id
        selectedNode = node
    }

    private func navigateToNode(id: Int) {
        selectedNode = graphManager.graphData?.nodes.first { $0.id == id }
        selectedNodeId = id
        focusNodeId = id
    }

    private func nodeTypeColor(_ type: String) -> Color {
        switch type {
        case "memory": return Color(hex: "4d94ff")
        case "person": return Color(hex: "33ccff")
        case "project": return Color(hex: "7b66ff")
        case "concept": return Color(hex: "4dffa6")
        case "event": return Color(hex: "ffaa33")
        case "preference": return Color(hex: "ff6699")
        case "tool": return Color(hex: "99ff33")
        default: return Color(hex: "4d94ff")
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

    private func deleteNode(id: Int) {
        Task {
            do {
                try await APIManager.shared.deleteGraphNode(id: id)
                await MainActor.run {
                    selectedNode = nil
                    selectedNodeId = nil
                    focusNodeId = nil
                    toastManager.success("Node deleted")
                }
                await graphManager.refresh()
            } catch {
                await MainActor.run {
                    toastManager.error("Failed to delete node")
                }
            }
        }
    }

    private func addMemory() async {
        let text = newMemoryText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        do {
            _ = try await APIManager.shared.createMemory(body: text)
            showAddMemory = false
            newMemoryText = ""
            toastManager.success("Memory saved")
            await graphManager.refresh()
        } catch {
            toastManager.error("Failed to save memory")
        }
    }
}

#Preview {
    MemoriesView(showMenu: .constant(false))
        .environmentObject(NeroManager.shared)
        .environmentObject(ToastManager.shared)
        .environmentObject(TabRouter())
        .environmentObject(GraphManager.shared)
        .preferredColorScheme(.dark)
}
