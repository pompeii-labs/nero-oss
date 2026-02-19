import SwiftUI

struct LogsView: View {
    @Binding var showMenu: Bool

    @EnvironmentObject var neroManager: NeroManager
    @EnvironmentObject var tabRouter: TabRouter

    @State private var entries: [LogEntry] = []
    @State private var loading = true
    @State private var streaming = true
    @State private var levelFilter: String = ""
    @State private var streamTask: Task<Void, Never>?

    private let maxEntries = 500
    private let levels = ["", "DEBUG", "INFO", "WARN", "ERROR", "TOOL"]

    private var filteredEntries: [LogEntry] {
        if levelFilter.isEmpty { return entries }
        return entries.filter { $0.level == levelFilter }
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NeroBackgroundView()

                if !neroManager.isConnected {
                    disconnectedState
                } else if loading {
                    loadingState
                } else if entries.isEmpty {
                    emptyState
                } else {
                    logContent
                }
            }
            .navigationTitle("Logs")
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
                        HStack(spacing: 12) {
                            if streaming {
                                HStack(spacing: 4) {
                                    Circle()
                                        .fill(Color.nSuccess)
                                        .frame(width: 6, height: 6)
                                    Text("Live")
                                        .font(.system(size: 11, weight: .medium))
                                        .foregroundColor(.nSuccess)
                                }
                            }

                            Button {
                                if streaming { stopStream() } else { startStream() }
                            } label: {
                                Image(systemName: streaming ? "pause.fill" : "play.fill")
                                    .font(.system(size: 14))
                                    .foregroundStyle(LinearGradient.neroGradient)
                            }

                            Button {
                                entries = []
                            } label: {
                                Image(systemName: "trash")
                                    .font(.system(size: 14))
                                    .foregroundColor(.nMutedForeground)
                            }
                        }
                    }
                }
            }
        }
        .task {
            if neroManager.isConnected {
                await loadLogs()
            }
        }
        .onChange(of: neroManager.isConnected) { _, connected in
            if connected {
                Task { await loadLogs() }
            } else {
                stopStream()
                entries = []
                loading = true
            }
        }
        .onDisappear {
            stopStream()
        }
    }

    private var disconnectedState: some View {
        VStack(spacing: 24) {
            Image(systemName: "scroll")
                .font(.system(size: 48))
                .foregroundStyle(LinearGradient.neroGradient)
                .opacity(0.6)

            VStack(spacing: 8) {
                Text("Connect to View Logs")
                    .font(.headline)
                    .foregroundColor(.white)

                Text("Set up a connection to stream logs")
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
            Text("Loading logs...")
                .font(.system(size: 14))
                .foregroundColor(.nMutedForeground)
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "scroll")
                .font(.system(size: 40))
                .foregroundColor(.nMutedForeground)
                .opacity(0.3)
            Text("No logs yet")
                .font(.system(size: 14))
                .foregroundColor(.nMutedForeground)
        }
    }

    private var logContent: some View {
        VStack(spacing: 0) {
            filterBar
                .padding(.horizontal, 12)
                .padding(.vertical, 8)

            Divider()
                .background(Color.nBorder)

            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(filteredEntries) { entry in
                            logRow(entry)
                                .id(entry.id)
                        }
                    }
                }
                .onChange(of: entries.count) { _, _ in
                    if let last = filteredEntries.last {
                        withAnimation(.easeOut(duration: 0.2)) {
                            proxy.scrollTo(last.id, anchor: .bottom)
                        }
                    }
                }
            }
        }
    }

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(levels, id: \.self) { level in
                    Button {
                        levelFilter = level
                    } label: {
                        Text(level.isEmpty ? "All" : level)
                            .font(.system(size: 11, weight: .medium, design: .monospaced))
                            .foregroundColor(levelFilter == level ? .white : .nMutedForeground)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 5)
                            .background(
                                Capsule()
                                    .fill(levelFilter == level ? Color.neroBlue.opacity(0.3) : Color.nCard)
                            )
                            .overlay(
                                Capsule()
                                    .stroke(levelFilter == level ? Color.neroBlue.opacity(0.5) : Color.nBorder, lineWidth: 1)
                            )
                    }
                }
            }
        }
    }

    private func logRow(_ entry: LogEntry) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(formatTime(entry.timestamp))
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.nMutedForeground.opacity(0.6))
                .frame(width: 65, alignment: .trailing)

            Text(entry.level)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundColor(levelColor(entry.level))
                .frame(width: 40, alignment: .trailing)

            Text(entry.source)
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.nMutedForeground)
                .frame(width: 55, alignment: .leading)
                .lineLimit(1)

            Text(entry.message)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.white.opacity(0.9))
                .lineLimit(3)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 3)
        .background(levelBgColor(entry.level))
    }

    private func levelColor(_ level: String) -> Color {
        switch level {
        case "DEBUG": return .nMutedForeground
        case "INFO": return .neroBlue
        case "WARN": return .nWarning
        case "ERROR": return .nError
        case "TOOL": return Color(hex: "A855F7")
        default: return .nMutedForeground
        }
    }

    private func levelBgColor(_ level: String) -> Color {
        switch level {
        case "ERROR": return .nError.opacity(0.05)
        case "WARN": return .nWarning.opacity(0.05)
        case "TOOL": return Color(hex: "A855F7").opacity(0.05)
        default: return .clear
        }
    }

    private func formatTime(_ timestamp: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: timestamp) else {
            formatter.formatOptions = [.withInternetDateTime]
            guard let date = formatter.date(from: timestamp) else { return "" }
            let tf = DateFormatter()
            tf.dateFormat = "HH:mm:ss"
            return tf.string(from: date)
        }
        let tf = DateFormatter()
        tf.dateFormat = "HH:mm:ss"
        return tf.string(from: date)
    }

    private func loadLogs() async {
        loading = true
        do {
            entries = try await APIManager.shared.getLogs(lines: 500)
        } catch {}
        loading = false
        startStream()
    }

    private func startStream() {
        stopStream()
        streamTask = APIManager.shared.streamLogs { entry in
            entries.append(entry)
            if entries.count > maxEntries {
                entries.removeFirst(entries.count - maxEntries)
            }
        }
        streaming = true
    }

    private func stopStream() {
        streamTask?.cancel()
        streamTask = nil
        streaming = false
    }
}

#Preview {
    LogsView(showMenu: .constant(false))
        .environmentObject(NeroManager.shared)
        .environmentObject(TabRouter())
        .preferredColorScheme(.dark)
}
