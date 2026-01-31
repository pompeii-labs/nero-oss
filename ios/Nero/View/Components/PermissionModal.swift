import SwiftUI

struct PermissionModal: View {
    let activity: ToolActivity
    let onApprove: () -> Void
    let onDeny: () -> Void

    @State private var appeared = false
    @State private var pulseGlow = false

    var body: some View {
        VStack(spacing: 24) {
            headerSection

            toolInfoSection

            argsSection

            buttonsSection
        }
        .padding(24)
        .background(
            LinearGradient(
                colors: [Color.nCard, Color.nCard.opacity(0.95)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 20))
        .overlay(
            RoundedRectangle(cornerRadius: 20)
                .stroke(
                    LinearGradient(
                        colors: [Color.nWarning.opacity(0.4), Color.nBorder, Color.nWarning.opacity(0.2)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .shadow(color: Color.nWarning.opacity(pulseGlow ? 0.3 : 0.15), radius: pulseGlow ? 25 : 15, y: 10)
        .shadow(color: .black.opacity(0.5), radius: 20, y: 10)
        .scaleEffect(appeared ? 1 : 0.9)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.75)) {
                appeared = true
            }
            withAnimation(.easeInOut(duration: 1.5).repeatForever(autoreverses: true)) {
                pulseGlow = true
            }
        }
    }

    private var headerSection: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(Color.nWarning.opacity(0.15))
                    .frame(width: 80, height: 80)
                    .blur(radius: 20)

                Image(systemName: "exclamationmark.shield.fill")
                    .font(.system(size: 40))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.nWarning, .nWarning.opacity(0.7)],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                    .shadow(color: .nWarning.opacity(0.5), radius: 10)
            }

            Text("Permission Required")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.white)

            Text("Nero wants to use a tool that requires your approval")
                .font(.subheadline)
                .foregroundColor(.nMutedForeground)
                .multilineTextAlignment(.center)
        }
    }

    private var toolInfoSection: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(
                        LinearGradient(
                            colors: [Color.neroBlue.opacity(0.2), Color.neroBlue.opacity(0.05)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 44, height: 44)

                Image(systemName: toolIcon)
                    .font(.title2)
                    .foregroundStyle(LinearGradient.neroGradient)
            }
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.neroBlue.opacity(0.3), lineWidth: 1)
            )

            VStack(alignment: .leading, spacing: 4) {
                Text(activity.tool)
                    .font(.headline)
                    .foregroundColor(.white)

                Text(toolDescription)
                    .font(.caption)
                    .foregroundColor(.nMutedForeground)
            }

            Spacer()
        }
        .padding()
        .background(
            LinearGradient(
                colors: [Color.nBackground, Color.nBackground.opacity(0.8)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.nBorder, lineWidth: 1)
        )
    }

    private var argsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Arguments")
                .font(.caption.weight(.medium))
                .foregroundColor(.nMutedForeground)

            ScrollView {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(Array(activity.args.keys.sorted()), id: \.self) { key in
                        HStack(alignment: .top) {
                            Text("\(key):")
                                .font(.caption.monospaced())
                                .foregroundColor(.neroBlue)
                                .frame(width: 80, alignment: .leading)

                            Text(formatArgValue(activity.args[key]))
                                .font(.caption.monospaced())
                                .foregroundColor(.white.opacity(0.9))
                                .lineLimit(3)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: 120)
            .padding()
            .background(Color.nBackground)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8)
                    .stroke(Color.nBorder, lineWidth: 1)
            )
        }
    }

    private var buttonsSection: some View {
        HStack(spacing: 12) {
            Button(action: onDeny) {
                Text("Deny")
                    .neroSecondaryButton()
            }

            Button(action: onApprove) {
                Text("Allow")
                    .neroButton()
            }
        }
    }

    private var toolIcon: String {
        let tool = activity.tool.lowercased()
        if tool.contains("read") { return "doc.text" }
        if tool.contains("write") { return "pencil" }
        if tool.contains("delete") || tool.contains("remove") { return "trash" }
        if tool.contains("execute") || tool.contains("command") || tool.contains("bash") { return "terminal" }
        if tool.contains("search") { return "magnifyingglass" }
        if tool.contains("web") || tool.contains("fetch") || tool.contains("http") { return "globe" }
        if tool.contains("file") { return "doc" }
        return "wrench.and.screwdriver"
    }

    private var toolDescription: String {
        let tool = activity.tool.lowercased()
        if tool.contains("read") { return "Read file contents" }
        if tool.contains("write") { return "Write to file" }
        if tool.contains("delete") || tool.contains("remove") { return "Delete file or data" }
        if tool.contains("execute") || tool.contains("command") || tool.contains("bash") { return "Execute system command" }
        if tool.contains("search") { return "Search files or content" }
        if tool.contains("web") || tool.contains("fetch") { return "Make web request" }
        return "Execute tool"
    }

    private func formatArgValue(_ value: AnyCodable?) -> String {
        guard let value = value else { return "nil" }
        return String(describing: value.value)
    }
}

#Preview {
    ZStack {
        Color.black.opacity(0.6)
            .ignoresSafeArea()

        PermissionModal(
            activity: ToolActivity(
                id: "1",
                tool: "execute_command",
                args: [
                    "command": AnyCodable("npm install"),
                    "cwd": AnyCodable("/Users/user/project")
                ],
                status: .pending
            ),
            onApprove: {},
            onDeny: {}
        )
        .padding(24)
    }
}
