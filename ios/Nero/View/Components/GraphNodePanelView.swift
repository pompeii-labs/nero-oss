import SwiftUI

struct GraphNodePanelView: View {
    let node: GraphNode
    let connections: [(node: GraphNode, relation: String)]
    let onNavigate: (Int) -> Void
    let onDelete: (Int) -> Void

    @State private var deleting = false

    private static let typeColors: [String: Color] = [
        "memory": Color(hex: "4d94ff"),
        "person": Color(hex: "33ccff"),
        "project": Color(hex: "7b66ff"),
        "concept": Color(hex: "4dffa6"),
        "event": Color(hex: "ffaa33"),
        "preference": Color(hex: "ff6699"),
        "tool": Color(hex: "99ff33"),
    ]

    private func typeColor(_ type: String) -> Color {
        Self.typeColors[type] ?? Color(hex: "4d94ff")
    }

    private func formatDate(_ dateStr: String?) -> String {
        guard let dateStr = dateStr, !dateStr.isEmpty else { return "Never" }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = iso.date(from: dateStr) ?? ISO8601DateFormatter().date(from: dateStr)
        guard let date = date else { return dateStr }
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        return formatter.string(from: date)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                NeroBackgroundView()

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        typeBadge

                        Text(node.label)
                            .font(.title2)
                            .fontWeight(.semibold)
                            .foregroundColor(.white)

                        if let body = node.body, !body.isEmpty {
                            Text(body)
                                .font(.body)
                                .foregroundColor(.nMutedForeground)
                                .fixedSize(horizontal: false, vertical: true)
                        }

                        if !connections.isEmpty {
                            connectionsSection
                        }

                        metadataSection

                        deleteButton
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Node Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(Color.nBackground.opacity(0.8), for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
    }

    private var typeBadge: some View {
        Text(node.type.capitalized)
            .font(.caption)
            .fontWeight(.medium)
            .foregroundColor(typeColor(node.type))
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(typeColor(node.type).opacity(0.15))
            .clipShape(Capsule())
    }

    private var connectionsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: "link")
                    .font(.caption)
                    .foregroundColor(.nMutedForeground)
                Text("CONNECTIONS")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundColor(.nMutedForeground)
                    .tracking(1)
            }

            VStack(spacing: 2) {
                ForEach(connections, id: \.node.id) { conn in
                    Button {
                        onNavigate(conn.node.id)
                    } label: {
                        HStack(spacing: 10) {
                            Circle()
                                .fill(typeColor(conn.node.type))
                                .frame(width: 8, height: 8)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(conn.node.label)
                                    .font(.subheadline)
                                    .foregroundColor(.white)
                                    .lineLimit(1)
                                Text(conn.relation)
                                    .font(.caption)
                                    .foregroundColor(.nMutedForeground)
                            }

                            Spacer()

                            Image(systemName: "chevron.right")
                                .font(.caption2)
                                .foregroundColor(.nMutedForeground)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.03))
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                    }
                }
            }
        }
    }

    private var metadataSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: "bolt.fill")
                    .font(.caption)
                    .foregroundColor(.nMutedForeground)
                Text("METADATA")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundColor(.nMutedForeground)
                    .tracking(1)
            }

            VStack(spacing: 4) {
                HStack {
                    Text("Strength")
                        .font(.caption)
                        .foregroundColor(.nMutedForeground)
                    Spacer()
                    Text(String(format: "%.2f", node.strength))
                        .font(.caption)
                        .foregroundColor(.white)
                        .monospacedDigit()
                }

                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color.white.opacity(0.1))
                            .frame(height: 6)

                        RoundedRectangle(cornerRadius: 3)
                            .fill(typeColor(node.type))
                            .frame(width: geo.size.width * min(1, node.strength / 2), height: 6)
                    }
                }
                .frame(height: 6)
            }

            HStack {
                HStack(spacing: 4) {
                    Image(systemName: "eye")
                        .font(.caption2)
                    Text("Accessed")
                }
                .font(.caption)
                .foregroundColor(.nMutedForeground)
                Spacer()
                Text("\(node.access_count) times")
                    .font(.caption)
                    .foregroundColor(.white)
                    .monospacedDigit()
            }

            HStack {
                HStack(spacing: 4) {
                    Image(systemName: "calendar")
                        .font(.caption2)
                    Text("Last accessed")
                }
                .font(.caption)
                .foregroundColor(.nMutedForeground)
                Spacer()
                Text(formatDate(node.last_accessed))
                    .font(.caption)
                    .foregroundColor(.white)
            }

            HStack {
                HStack(spacing: 4) {
                    Image(systemName: "calendar")
                        .font(.caption2)
                    Text("Created")
                }
                .font(.caption)
                .foregroundColor(.nMutedForeground)
                Spacer()
                Text(formatDate(node.created_at))
                    .font(.caption)
                    .foregroundColor(.white)
            }
        }
        .padding(16)
        .glassCard()
    }

    private var deleteButton: some View {
        Button(role: .destructive) {
            deleting = true
            onDelete(node.id)
        } label: {
            HStack(spacing: 8) {
                if deleting {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: .red))
                        .scaleEffect(0.8)
                } else {
                    Image(systemName: "trash")
                }
                Text("Delete Node")
            }
            .font(.subheadline)
            .fontWeight(.medium)
            .foregroundColor(.red)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Color.red.opacity(0.1))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.red.opacity(0.2), lineWidth: 1)
            )
        }
        .disabled(deleting)
    }
}
