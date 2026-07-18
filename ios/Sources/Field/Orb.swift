import SwiftUI

/// Nero's presence: an obsidian sphere lit from within, wrapped in a gyroscopic
/// reticle. Pure SwiftUI layers. State drives the character (calm / introspective /
/// reaching-out / speaking). Ported from web/src/lib/components/field/Orb.svelte.
struct Orb: View {
    enum State { case idle, thinking, tool, speaking }

    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var state: State = .idle
    var size: CGFloat = 132

    @SwiftUI.State private var breathe = false
    @SwiftUI.State private var corePulse = false
    @SwiftUI.State private var spin = false
    @SwiftUI.State private var ping = false

    private var active: Bool { state == .thinking || state == .tool }

    var body: some View {
        ZStack {
            // bloom
            Circle()
                .fill(RadialGradient(
                    colors: [theme.holo(active ? 0.4 : 0.26), .clear],
                    center: .center, startRadius: 0, endRadius: size * 0.8))
                .frame(width: size * 1.6, height: size * 1.6)
                .blur(radius: 12)

            // expanding ping (thinking/tool)
            if active {
                Circle()
                    .stroke(theme.holo(0.45), lineWidth: 1.5)
                    .frame(width: size, height: size)
                    .scaleEffect(ping ? 1.7 : 0.9)
                    .opacity(ping ? 0 : 0.6)
            }

            // sphere body
            Circle()
                .fill(RadialGradient(
                    colors: theme.orbStops,
                    center: .init(x: 0.38, y: 0.3), startRadius: 0, endRadius: size * 0.74))
                .overlay(Circle().strokeBorder(theme.holo(0.12), lineWidth: 1))
                .frame(width: size, height: size)
                .shadow(color: .black.opacity(0.8), radius: 20, y: 8)

            // glowing core
            Circle()
                .fill(RadialGradient(
                    colors: [theme.holoHot, theme.holo(0.9), .clear],
                    center: .center, startRadius: 0, endRadius: size * 0.36))
                .frame(width: size * 0.64, height: size * 0.64)
                .blendMode(.screen)
                .blur(radius: 2)
                .scaleEffect(corePulse ? 1.1 : 0.95)
                .opacity(corePulse ? 1 : 0.75)

            // counter-accent flare (tool = reaching out)
            if state == .tool {
                Circle()
                    .fill(RadialGradient(
                        colors: [theme.holo2(0.55), .clear],
                        center: .center, startRadius: 0, endRadius: size * 0.42))
                    .frame(width: size * 0.8, height: size * 0.8)
                    .blendMode(.screen)
            }

            reticle
        }
        // Layout footprint is the diameter; the bloom + reticle overflow visually
        // (not clipped) so the orb doesn't push surrounding layout off-screen.
        .frame(width: size, height: size)
        .scaleEffect(breathe ? 1.025 : 1.0)
        .onAppear(perform: run)
        .onChange(of: state) { _, _ in run() }
    }

    private var reticle: some View {
        ZStack {
            Circle()
                .trim(from: 0, to: 0.72)
                .stroke(theme.holo(0.5), style: StrokeStyle(lineWidth: 1.5, lineCap: .round, dash: [46, 200]))
                .frame(width: size * 1.16, height: size * 1.16)
                .rotationEffect(.degrees(spin ? 360 : 0))
            Circle()
                .stroke(theme.holo2(state == .tool ? 0.6 : 0.3), style: StrokeStyle(lineWidth: 1, dash: [3, 9]))
                .frame(width: size * 1.34, height: size * 1.34)
                .rotationEffect(.degrees(spin ? -360 : 0))
            Circle()
                .trim(from: 0, to: 0.18)
                .stroke(theme.holoSoft, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                .frame(width: size * 1.1, height: size * 1.1)
                .rotationEffect(.degrees(spin ? 360 : 0))
                .shadow(color: theme.holo(0.8), radius: 6)
        }
    }

    private func run() {
        guard !reduceMotion else {
            breathe = false; corePulse = true; spin = false; ping = false
            return
        }
        let breatheDur = state == .thinking ? 3.4 : (state == .tool ? 5.0 : 7.0)
        let coreDur = state == .thinking ? 1.5 : (state == .tool ? 0.8 : 3.6)
        let spinDur = state == .idle ? 26.0 : 12.0
        withAnimation(.easeInOut(duration: breatheDur).repeatForever(autoreverses: true)) { breathe = true }
        withAnimation(.easeInOut(duration: coreDur).repeatForever(autoreverses: true)) { corePulse = true }
        withAnimation(.linear(duration: spinDur).repeatForever(autoreverses: false)) { spin = true }
        if active {
            ping = false
            withAnimation(.easeOut(duration: state == .tool ? 1.5 : 2.6).repeatForever(autoreverses: false)) { ping = true }
        }
    }
}
