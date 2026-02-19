import SwiftUI

class TabRouter: ObservableObject {
    @Published var selectedTab: Tab = .chat
}

enum Tab: Int, CaseIterable {
    case chat = 0
    case voice = 1
    case memories = 2
    case logs = 3
    case mcp = 4
    case settings = 5

    var icon: String {
        switch self {
        case .chat: return "bubble.left.and.bubble.right"
        case .voice: return "waveform"
        case .memories: return "brain.head.profile"
        case .logs: return "scroll"
        case .mcp: return "puzzlepiece.extension"
        case .settings: return "gearshape"
        }
    }

    var selectedIcon: String {
        switch self {
        case .chat: return "bubble.left.and.bubble.right.fill"
        case .voice: return "waveform.circle.fill"
        case .memories: return "brain.head.profile.fill"
        case .logs: return "scroll.fill"
        case .mcp: return "puzzlepiece.extension.fill"
        case .settings: return "gearshape.fill"
        }
    }

    var label: String {
        switch self {
        case .chat: return "Chat"
        case .voice: return "Voice"
        case .memories: return "Memories"
        case .logs: return "Logs"
        case .mcp: return "MCP"
        case .settings: return "Settings"
        }
    }
}

struct MainTabView: View {
    @StateObject private var tabRouter = TabRouter()
    @State private var showMenu = false

    var body: some View {
        ZStack {
            Group {
                switch tabRouter.selectedTab {
                case .chat:
                    ChatView(showMenu: $showMenu)
                case .voice:
                    VoiceView(showMenu: $showMenu)
                case .memories:
                    MemoriesView(showMenu: $showMenu)
                case .logs:
                    LogsView(showMenu: $showMenu)
                case .mcp:
                    MCPView(showMenu: $showMenu)
                case .settings:
                    SettingsView(showMenu: $showMenu)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .environmentObject(tabRouter)
        .sheet(isPresented: $showMenu) {
            NavigationMenu(selectedTab: $tabRouter.selectedTab, showMenu: $showMenu)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
                .presentationBackground(Color.nCard)
        }
    }
}

struct NavigationMenu: View {
    @Binding var selectedTab: Tab
    @Binding var showMenu: Bool
    @EnvironmentObject var neroManager: NeroManager

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color.neroBlue.opacity(0.3), Color.neroCyan.opacity(0.15)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 44, height: 44)

                    Text("N")
                        .font(.system(size: 22, weight: .bold, design: .rounded))
                        .foregroundStyle(LinearGradient.neroGradient)
                }
                .shadow(color: .neroBlue.opacity(0.4), radius: 8)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Nero")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)

                    HStack(spacing: 4) {
                        Circle()
                            .fill(neroManager.isConnected ? Color.nSuccess : Color.nError)
                            .frame(width: 6, height: 6)
                        Text(neroManager.isConnected ? "Connected" : "Disconnected")
                            .font(.system(size: 12))
                            .foregroundColor(.nMutedForeground)
                    }
                }

                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 20)
            .padding(.bottom, 12)

            Divider()
                .background(Color.nBorder)
                .padding(.horizontal, 20)

            VStack(spacing: 4) {
                ForEach(Tab.allCases, id: \.self) { tab in
                    menuButton(tab)
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)

            Spacer()
        }
    }

    private func menuButton(_ tab: Tab) -> some View {
        let isSelected = selectedTab == tab

        return Button {
            selectedTab = tab
            showMenu = false

            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()
        } label: {
            HStack(spacing: 14) {
                Image(systemName: isSelected ? tab.selectedIcon : tab.icon)
                    .font(.system(size: 20, weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(
                        isSelected
                            ? LinearGradient.neroGradient
                            : LinearGradient(colors: [Color.nMutedForeground], startPoint: .top, endPoint: .bottom)
                    )
                    .frame(width: 28)

                Text(tab.label)
                    .font(.system(size: 16, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? .white : .nMutedForeground)

                Spacer()

                if isSelected {
                    Circle()
                        .fill(Color.neroBlue)
                        .frame(width: 6, height: 6)
                        .shadow(color: .neroBlue.opacity(0.5), radius: 4)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isSelected ? Color.neroBlue.opacity(0.15) : Color.clear)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Color.neroBlue.opacity(0.3) : Color.clear, lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    MainTabView()
        .environmentObject(NeroManager.shared)
        .environmentObject(APIManager.shared)
        .environmentObject(VoiceManager.shared)
        .environmentObject(ToastManager.shared)
        .preferredColorScheme(.dark)
}
