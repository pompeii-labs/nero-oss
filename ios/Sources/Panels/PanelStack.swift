import SwiftUI

/// The open panels Nero has thrown, as a scrollable stack of glass cards (the web
/// collapses its floating windows to a stack on phones too). Interactions route to
/// the panel endpoints: `call` runs a server function, `interact` drives a Nero turn.
struct PanelStack: View {
    @ObservedObject var store: NeroStore

    private var open: [Panel] { store.panels.filter(\.isOpen) }

    var body: some View {
        if !open.isEmpty {
            ScrollView {
                LazyVStack(spacing: 12) {
                    ForEach(open) { panel in
                        PanelCard(
                            panel: panel,
                            onAction: { act, label in handle(panel, act, label) },
                            onClose: { Task { await store.client.panelClose(panel.id) } }
                        )
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }
            .frame(maxHeight: 340)
        }
    }

    private func handle(_ panel: Panel, _ action: PanelAction, _ label: String) {
        Task {
            if action.type == "call", let fn = action.fn {
                await store.client.panelCall(panel.id, fn: fn)
            } else {
                await store.client.panelInteract(panel.id, control: label, intent: action.intent, value: action.value?.anyValue)
            }
        }
    }
}

struct PanelCard: View {
    @Environment(\.theme) private var theme
    let panel: Panel
    let onAction: (PanelAction, String) -> Void
    let onClose: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Circle().fill(theme.holo()).frame(width: 5, height: 5).shadow(color: theme.holo(0.8), radius: 3)
                Text((panel.title ?? "PANEL").uppercased())
                    .font(Typeface.mono(10)).tracking(1.2)
                    .foregroundStyle(theme.textDim)
                Spacer()
                Button(action: onClose) {
                    Image(systemName: "xmark").font(.system(size: 10, weight: .bold)).foregroundStyle(theme.textFaint)
                }
            }
            ForEach(Array((panel.components ?? []).enumerated()), id: \.offset) { _, comp in
                PanelComponentView(comp: comp, state: panel.resolvedState, onAction: onAction)
            }
        }
        .padding(14)
        .glass(radius: 10, strokeAlpha: 0.18)
        .overlay(CornerBrackets().stroke(theme.holoSoft.opacity(0.5), lineWidth: 1.2))
    }
}

/// Four short "lock-on" reticle brackets at the card corners.
private struct CornerBrackets: Shape {
    var len: CGFloat = 12
    var inset: CGFloat = 4
    func path(in rect: CGRect) -> Path {
        var p = Path()
        let r = rect.insetBy(dx: inset, dy: inset)
        // top-left
        p.move(to: CGPoint(x: r.minX, y: r.minY + len)); p.addLine(to: CGPoint(x: r.minX, y: r.minY)); p.addLine(to: CGPoint(x: r.minX + len, y: r.minY))
        // top-right
        p.move(to: CGPoint(x: r.maxX - len, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX, y: r.minY + len))
        // bottom-left
        p.move(to: CGPoint(x: r.minX, y: r.maxY - len)); p.addLine(to: CGPoint(x: r.minX, y: r.maxY)); p.addLine(to: CGPoint(x: r.minX + len, y: r.maxY))
        // bottom-right
        p.move(to: CGPoint(x: r.maxX - len, y: r.maxY)); p.addLine(to: CGPoint(x: r.maxX, y: r.maxY)); p.addLine(to: CGPoint(x: r.maxX, y: r.maxY - len))
        return p
    }
}
