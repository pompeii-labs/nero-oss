import SwiftUI

struct MCPView: View {
    @Binding var showMenu: Bool

    @EnvironmentObject var neroManager: NeroManager
    @EnvironmentObject var toastManager: ToastManager
    @EnvironmentObject var tabRouter: TabRouter

    @State private var servers: [McpServerConfig] = []
    @State private var tools: [String] = []
    @State private var loading = true
    @State private var reloading = false
    @State private var expandedServer: String?

    var body: some View {
        NavigationStack {
            ZStack {
                NeroBackgroundView()

                if !neroManager.isConnected {
                    disconnectedState
                } else if loading {
                    loadingState
                } else {
                    serverList
                }
            }
            .navigationTitle("MCP Servers")
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
                            Task { await handleReload() }
                        } label: {
                            if reloading {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .neroBlue))
                                    .scaleEffect(0.7)
                            } else {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 14))
                                    .foregroundStyle(LinearGradient.neroGradient)
                            }
                        }
                        .disabled(reloading)
                    }
                }
            }
        }
        .task {
            if neroManager.isConnected {
                await loadServers()
            }
        }
        .onChange(of: neroManager.isConnected) { _, connected in
            if connected {
                Task { await loadServers() }
            } else {
                servers = []
                tools = []
                loading = true
            }
        }
    }

    private var disconnectedState: some View {
        VStack(spacing: 24) {
            Image(systemName: "puzzlepiece.extension")
                .font(.system(size: 48))
                .foregroundStyle(LinearGradient.neroGradient)
                .opacity(0.6)

            VStack(spacing: 8) {
                Text("Connect to Manage Servers")
                    .font(.headline)
                    .foregroundColor(.white)

                Text("Set up a connection to view MCP servers")
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
        .floatUp(delay: 0.1)
    }

    private var loadingState: some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: .neroBlue))
                .scaleEffect(1.2)
            Text("Loading servers...")
                .font(.system(size: 14))
                .foregroundColor(.nMutedForeground)
        }
    }

    private var serverList: some View {
        ScrollView {
            VStack(spacing: 12) {
                if servers.isEmpty {
                    emptyState
                        .floatUp(delay: 0.1)
                } else {
                    ForEach(Array(servers.enumerated()), id: \.element.name) { index, server in
                        serverCard(server)
                            .floatUp(delay: Double(min(index, 6)) * 0.05)
                    }
                }

                if !tools.isEmpty {
                    toolsSummary
                        .floatUp(delay: 0.2)
                }
            }
            .padding()
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "puzzlepiece.extension")
                .font(.system(size: 40))
                .foregroundColor(.nMutedForeground)
                .opacity(0.3)

            Text("No MCP servers configured")
                .font(.system(size: 16, weight: .medium))
                .foregroundColor(.white)

            Text("Add MCP servers in your Nero config to extend capabilities with external tools.")
                .font(.system(size: 14))
                .foregroundColor(.nMutedForeground)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)
        }
        .padding(.vertical, 40)
    }

    private func serverCard(_ server: McpServerConfig) -> some View {
        let isExpanded = expandedServer == server.name
        let serverTools = tools.filter { $0.hasPrefix("\(server.name):") }
        let isDisabled = server.disabled ?? false

        return VStack(spacing: 0) {
            Button {
                withAnimation(.spring(response: 0.3)) {
                    expandedServer = isExpanded ? nil : server.name
                }
            } label: {
                HStack(spacing: 12) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(
                                server.transport == "http"
                                    ? Color.neroBlue.opacity(0.15)
                                    : Color.neroCyan.opacity(0.15)
                            )
                            .frame(width: 40, height: 40)

                        Image(systemName: server.transport == "http" ? "globe" : "terminal.fill")
                            .font(.system(size: 18))
                            .foregroundColor(server.transport == "http" ? .neroBlue : .neroCyan)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        HStack(spacing: 8) {
                            Text(server.name)
                                .font(.system(size: 15, weight: .medium))
                                .foregroundColor(.white)

                            if isDisabled {
                                Text("DISABLED")
                                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                                    .foregroundColor(.nMutedForeground)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(
                                        Capsule().fill(Color.nMuted)
                                    )
                            }
                        }

                        if server.transport == "http" {
                            Text(server.url ?? "")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.nMutedForeground)
                                .lineLimit(1)
                        } else {
                            Text("\(server.command ?? "") \(server.args?.joined(separator: " ") ?? "")")
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.nMutedForeground)
                                .lineLimit(1)
                        }

                        if !serverTools.isEmpty {
                            HStack(spacing: 4) {
                                Image(systemName: "cpu")
                                    .font(.system(size: 10))
                                    .foregroundColor(.neroBlue.opacity(0.7))
                                Text("\(serverTools.count) tool\(serverTools.count == 1 ? "" : "s")")
                                    .font(.system(size: 11))
                                    .foregroundColor(.nMutedForeground)
                            }
                        }
                    }

                    Spacer()

                    HStack(spacing: 8) {
                        Circle()
                            .fill(isDisabled ? Color.nMutedForeground : Color.nSuccess)
                            .frame(width: 8, height: 8)

                        Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.nMutedForeground)
                    }
                }
                .padding(16)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .opacity(isDisabled ? 0.6 : 1)

            if isExpanded {
                VStack(spacing: 12) {
                    Divider()
                        .background(Color.nBorder)

                    HStack(spacing: 10) {
                        Button {
                            Task { await toggleServer(server) }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: isDisabled ? "power" : "poweroff")
                                    .font(.system(size: 12))
                                Text(isDisabled ? "Enable" : "Disable")
                                    .font(.system(size: 13, weight: .medium))
                            }
                            .foregroundColor(isDisabled ? .nSuccess : .nWarning)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill((isDisabled ? Color.nSuccess : Color.nWarning).opacity(0.1))
                            )
                        }

                        Button {
                            Task { await removeServer(server) }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "trash")
                                    .font(.system(size: 12))
                                Text("Remove")
                                    .font(.system(size: 13, weight: .medium))
                            }
                            .foregroundColor(.nError)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(
                                Capsule()
                                    .fill(Color.nError.opacity(0.1))
                            )
                        }

                        Spacer()
                    }
                    .padding(.horizontal, 16)

                    if !serverTools.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("TOOLS")
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundColor(.nMutedForeground)

                            FlowLayout(spacing: 6) {
                                ForEach(serverTools, id: \.self) { tool in
                                    Text(tool.replacingOccurrences(of: "\(server.name):", with: ""))
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundColor(.neroBlue.opacity(0.8))
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(
                                            RoundedRectangle(cornerRadius: 6)
                                                .fill(Color.neroBlue.opacity(0.1))
                                        )
                                        .overlay(
                                            RoundedRectangle(cornerRadius: 6)
                                                .stroke(Color.neroBlue.opacity(0.2), lineWidth: 1)
                                        )
                                }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
                .padding(.bottom, 16)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.nCard.opacity(0.8))
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(Color.nBorder, lineWidth: 1)
                )
        )
    }

    private var toolsSummary: some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(Color.neroBlue.opacity(0.1))
                    .frame(width: 32, height: 32)

                Image(systemName: "wrench.and.screwdriver")
                    .font(.system(size: 14))
                    .foregroundColor(.neroBlue)
            }

            Text("\(tools.count) total tools available")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(.white)

            Spacer()
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.nCard.opacity(0.6))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.nBorder, lineWidth: 1)
                )
        )
    }

    private func loadServers() async {
        loading = true
        do {
            let result = try await APIManager.shared.getMcpServers()
            servers = result.servers
            tools = result.tools
        } catch {}
        loading = false
    }

    private func handleReload() async {
        reloading = true
        do {
            let toolCount = try await APIManager.shared.reload()
            await loadServers()
            toastManager.show("Reloaded with \(toolCount) tools", type: .success)
        } catch {
            toastManager.show("Failed to reload", type: .error)
        }
        reloading = false
    }

    private func toggleServer(_ server: McpServerConfig) async {
        let isDisabled = server.disabled ?? false
        do {
            try await APIManager.shared.toggleMcpServer(name: server.name, disabled: !isDisabled)
            await loadServers()
            toastManager.show("Server \(!isDisabled ? "disabled" : "enabled")", type: .success)
        } catch {
            toastManager.show("Failed to toggle server", type: .error)
        }
    }

    private func removeServer(_ server: McpServerConfig) async {
        do {
            try await APIManager.shared.removeMcpServer(name: server.name)
            servers.removeAll { $0.name == server.name }
            expandedServer = nil
            toastManager.show("Server removed", type: .success)
        } catch {
            toastManager.show("Failed to remove server", type: .error)
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = arrange(proposal: proposal, subviews: subviews)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrange(proposal: proposal, subviews: subviews)
        for (index, position) in result.positions.enumerated() {
            subviews[index].place(at: CGPoint(x: bounds.minX + position.x, y: bounds.minY + position.y), proposal: .unspecified)
        }
    }

    private func arrange(proposal: ProposedViewSize, subviews: Subviews) -> (size: CGSize, positions: [CGPoint]) {
        let maxWidth = proposal.width ?? .infinity
        var positions: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var maxX: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x + size.width > maxWidth && x > 0 {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            rowHeight = max(rowHeight, size.height)
            x += size.width + spacing
            maxX = max(maxX, x)
        }

        return (CGSize(width: maxX, height: y + rowHeight), positions)
    }
}

#Preview {
    MCPView(showMenu: .constant(false))
        .environmentObject(NeroManager.shared)
        .environmentObject(ToastManager.shared)
        .environmentObject(TabRouter())
        .preferredColorScheme(.dark)
}
