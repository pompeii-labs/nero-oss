import SwiftUI

struct ToolActivityView: View {
    let activity: ToolActivity

    @State private var appeared = false
    @State private var pulseGlow = false

    var body: some View {
        HStack(spacing: 8) {
            statusIcon

            Text(activity.tool)
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundColor(.white)
                .lineLimit(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(statusBackground)
        .clipShape(Capsule())
        .overlay(
            Capsule()
                .stroke(statusBorderGradient, lineWidth: 1)
        )
        .shadow(color: statusGlowColor.opacity(pulseGlow ? 0.5 : 0.25), radius: activity.status == .running ? 12 : 6, x: 0, y: 2)
        .scaleEffect(appeared ? 1 : 0.8)
        .opacity(appeared ? 1 : 0)
        .onAppear {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.7)) {
                appeared = true
            }
            if activity.status == .running {
                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                    pulseGlow = true
                }
            }
        }
        .onChange(of: activity.status) { _, newStatus in
            if newStatus == .running {
                withAnimation(.easeInOut(duration: 1).repeatForever(autoreverses: true)) {
                    pulseGlow = true
                }
            } else {
                pulseGlow = false
            }
        }
    }

    @ViewBuilder
    private var statusIcon: some View {
        Group {
            switch activity.status {
            case .pending:
                Image(systemName: "circle.dotted")
                    .foregroundColor(.nMutedForeground)
            case .approved:
                Image(systemName: "checkmark.circle")
                    .foregroundColor(.neroCyan)
                    .shadow(color: .neroCyan.opacity(0.5), radius: 4)
            case .denied:
                Image(systemName: "xmark.circle")
                    .foregroundColor(.nError)
            case .skipped:
                Image(systemName: "arrow.right.circle")
                    .foregroundColor(.nMutedForeground)
            case .running:
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: .neroBlue))
                    .scaleEffect(0.6)
            case .complete:
                Image(systemName: "checkmark.circle.fill")
                    .foregroundColor(.neroCyan)
                    .shadow(color: .neroCyan.opacity(0.6), radius: 4)
            case .error:
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.nError)
                    .shadow(color: .nError.opacity(0.5), radius: 4)
            }
        }
        .font(.system(size: 14))
    }

    private var statusBackground: some ShapeStyle {
        switch activity.status {
        case .running:
            return AnyShapeStyle(
                LinearGradient(
                    colors: [Color.neroBlue.opacity(0.2), Color.neroBlue.opacity(0.08)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        case .complete:
            return AnyShapeStyle(
                LinearGradient(
                    colors: [Color.neroCyan.opacity(0.2), Color.neroCyan.opacity(0.08)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        case .error, .denied:
            return AnyShapeStyle(
                LinearGradient(
                    colors: [Color.nError.opacity(0.2), Color.nError.opacity(0.08)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        default:
            return AnyShapeStyle(
                LinearGradient(
                    colors: [Color.nCard, Color.nCard.opacity(0.8)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        }
    }

    private var statusBorderGradient: some ShapeStyle {
        switch activity.status {
        case .running:
            return AnyShapeStyle(
                LinearGradient(
                    colors: [Color.neroBlue.opacity(0.6), Color.neroBlue.opacity(0.3)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        case .complete:
            return AnyShapeStyle(
                LinearGradient(
                    colors: [Color.neroCyan.opacity(0.6), Color.neroCyan.opacity(0.3)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        case .error, .denied:
            return AnyShapeStyle(
                LinearGradient(
                    colors: [Color.nError.opacity(0.6), Color.nError.opacity(0.3)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        default:
            return AnyShapeStyle(
                LinearGradient(
                    colors: [Color.nBorder, Color.nBorder.opacity(0.5)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        }
    }

    private var statusGlowColor: Color {
        switch activity.status {
        case .running:
            return .neroBlue
        case .complete:
            return .neroCyan
        case .error, .denied:
            return .nError
        default:
            return .clear
        }
    }
}

#Preview {
    ZStack {
        Color.nBackground.ignoresSafeArea()

        VStack(spacing: 12) {
            ToolActivityView(activity: ToolActivity(
                id: "1",
                tool: "read_file",
                args: [:],
                status: .pending
            ))
            ToolActivityView(activity: ToolActivity(
                id: "2",
                tool: "execute_command",
                args: [:],
                status: .running
            ))
            ToolActivityView(activity: ToolActivity(
                id: "3",
                tool: "write_file",
                args: [:],
                status: .complete
            ))
            ToolActivityView(activity: ToolActivity(
                id: "4",
                tool: "delete_file",
                args: [:],
                status: .error,
                error: "Permission denied"
            ))
        }
        .padding()
    }
}
