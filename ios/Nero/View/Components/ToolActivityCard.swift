import SwiftUI

struct ToolActivityCard: View {
    let activity: ToolActivity

    @State private var isExpanded = false
    @State private var appeared = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.8)) {
                    isExpanded.toggle()
                }
            } label: {
                headerRow
            }
            .buttonStyle(.plain)

            if isExpanded {
                expandedContent
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .move(edge: .top)),
                        removal: .opacity
                    ))
            }
        }
        .background(cardBackground)
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(cardBorder)
        .shadow(color: statusGlowColor.opacity(0.15), radius: 8, y: 2)
        .scaleEffect(appeared ? 1 : 0.95)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                appeared = true
            }
        }
    }

    private var headerRow: some View {
        HStack(spacing: 12) {
            toolIcon

            VStack(alignment: .leading, spacing: 2) {
                Text(activity.tool)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                    .foregroundColor(.white)

                Text(statusText)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(statusColor)
            }

            Spacer()

            HStack(spacing: 8) {
                statusIndicator

                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.nMutedForeground)
                    .rotationEffect(.degrees(isExpanded ? 90 : 0))
            }
        }
        .padding(14)
    }

    private var toolIcon: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 10)
                .fill(
                    LinearGradient(
                        colors: [statusColor.opacity(0.2), statusColor.opacity(0.08)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 40, height: 40)

            Image(systemName: toolIconName)
                .font(.system(size: 18))
                .foregroundColor(statusColor)
        }
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(statusColor.opacity(0.3), lineWidth: 1)
        )
    }

    private var statusIndicator: some View {
        Group {
            switch activity.status {
            case .running:
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .neroBlue))
                    .scaleEffect(0.7)
            case .complete:
                Image(systemName: "checkmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.neroCyan)
            case .error:
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(.nError)
            default:
                Image(systemName: "circle.dotted")
                    .font(.system(size: 12))
                    .foregroundColor(.nMutedForeground)
            }
        }
        .frame(width: 20, height: 20)
    }

    private var expandedContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            Divider()
                .background(Color.nBorder)

            if !activity.args.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("ARGUMENTS")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.nMutedForeground)

                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(activity.args.keys.sorted()), id: \.self) { key in
                            HStack(alignment: .top, spacing: 8) {
                                Text(key)
                                    .font(.system(size: 12, weight: .medium, design: .monospaced))
                                    .foregroundColor(.neroBlue)

                                Text(formatArgValue(activity.args[key]))
                                    .font(.system(size: 12, design: .monospaced))
                                    .foregroundColor(.white.opacity(0.8))
                                    .lineLimit(4)
                            }
                        }
                    }
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.nBackground.opacity(0.6))
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
            }

            if let result = activity.result {
                VStack(alignment: .leading, spacing: 8) {
                    Text("RESULT")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.nMutedForeground)

                    Text(result)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(.neroCyan)
                        .lineLimit(6)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.neroCyan.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.neroCyan.opacity(0.2), lineWidth: 1)
                        )
                }
            }

            if let error = activity.error {
                VStack(alignment: .leading, spacing: 8) {
                    Text("ERROR")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundColor(.nError)

                    Text(error)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundColor(.nError)
                        .lineLimit(4)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.nError.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color.nError.opacity(0.3), lineWidth: 1)
                        )
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 14)
    }

    private var cardBackground: some View {
        ZStack {
            Color.nCard

            LinearGradient(
                colors: [statusColor.opacity(0.06), Color.clear],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        }
    }

    private var cardBorder: some View {
        RoundedRectangle(cornerRadius: 14)
            .stroke(
                LinearGradient(
                    colors: [statusColor.opacity(0.4), Color.nBorder, statusColor.opacity(0.15)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                lineWidth: 1
            )
    }

    private var toolIconName: String {
        let tool = activity.tool.lowercased()
        if tool.contains("read") { return "doc.text" }
        if tool.contains("write") || tool.contains("edit") { return "pencil" }
        if tool.contains("delete") || tool.contains("remove") { return "trash" }
        if tool.contains("execute") || tool.contains("command") || tool.contains("bash") { return "terminal" }
        if tool.contains("search") || tool.contains("grep") || tool.contains("glob") { return "magnifyingglass" }
        if tool.contains("web") || tool.contains("fetch") || tool.contains("http") { return "globe" }
        if tool.contains("file") { return "doc" }
        if tool.contains("git") { return "arrow.triangle.branch" }
        return "wrench.and.screwdriver"
    }

    private var statusText: String {
        switch activity.status {
        case .pending: return "Pending"
        case .approved: return "Approved"
        case .denied: return "Denied"
        case .skipped: return "Skipped"
        case .running: return "Running..."
        case .complete: return "Complete"
        case .error: return "Error"
        }
    }

    private var statusColor: Color {
        switch activity.status {
        case .running: return .neroBlue
        case .complete: return .neroCyan
        case .error, .denied: return .nError
        case .approved: return .neroCyan
        default: return .nMutedForeground
        }
    }

    private var statusGlowColor: Color {
        switch activity.status {
        case .running: return .neroBlue
        case .complete: return .neroCyan
        case .error: return .nError
        default: return .clear
        }
    }

    private func formatArgValue(_ value: AnyCodable?) -> String {
        guard let value = value else { return "nil" }
        let str = String(describing: value.value)
        if str.count > 200 {
            return String(str.prefix(200)) + "..."
        }
        return str
    }
}

#Preview {
    ZStack {
        NeroBackgroundView()

        VStack(spacing: 12) {
            ToolActivityCard(activity: ToolActivity(
                id: "1",
                tool: "read_file",
                args: ["path": AnyCodable("/Users/user/file.txt")],
                status: .complete,
                result: "File contents here..."
            ))

            ToolActivityCard(activity: ToolActivity(
                id: "2",
                tool: "execute_command",
                args: ["command": AnyCodable("npm install")],
                status: .running
            ))

            ToolActivityCard(activity: ToolActivity(
                id: "3",
                tool: "write_file",
                args: ["path": AnyCodable("/Users/user/new.txt"), "content": AnyCodable("Hello world")],
                status: .error,
                error: "Permission denied"
            ))
        }
        .padding()
    }
}
