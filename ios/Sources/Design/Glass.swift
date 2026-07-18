import SwiftUI

/// The signature frosted-glass slab: material blur, a dark panel tint, a thin
/// holo-tinted border with an inner top highlight, and an outer holo bloom + drop.
struct GlassBackground: ViewModifier {
    @Environment(\.theme) private var theme
    var radius: CGFloat = 16
    var strokeAlpha: Double = 0.2
    var bloom: Double = 0.22

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        return content
            .background {
                shape
                    .fill(.ultraThinMaterial)
                    .overlay {
                        LinearGradient(
                            colors: theme.panelStops,
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                        .clipShape(shape)
                    }
                    .overlay {
                        shape.strokeBorder(theme.holo(strokeAlpha), lineWidth: 1)
                    }
                    .overlay(alignment: .top) {
                        // inner top metal highlight
                        Rectangle()
                            .fill(
                                LinearGradient(
                                    colors: [.white.opacity(0.16), .clear],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                            .frame(height: radius)
                            .clipShape(shape)
                            .allowsHitTesting(false)
                    }
                    .shadow(color: theme.holo(bloom), radius: 22)
                    .shadow(color: .black.opacity(0.85), radius: 30, y: 16)
            }
    }
}

extension View {
    func glass(radius: CGFloat = 16, strokeAlpha: Double = 0.2, bloom: Double = 0.22) -> some View {
        modifier(GlassBackground(radius: radius, strokeAlpha: strokeAlpha, bloom: bloom))
    }
}

/// The Field background: a radial void ground, two soft drifting holo clouds, a vignette.
struct Atmosphere: View {
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var drift = false

    var body: some View {
        ZStack {
            RadialGradient(
                colors: theme.fieldStops,
                center: .init(x: 0.5, y: -0.1),
                startRadius: 0,
                endRadius: 900
            )

            cloud(theme.holo(0.07), size: 520)
                .offset(x: drift ? -60 : -110, y: drift ? -140 : -80)
            cloud(theme.holo2(0.05), size: 460)
                .offset(x: drift ? 120 : 70, y: drift ? 220 : 300)

            RadialGradient(
                colors: [.clear, theme.void_.opacity(0.55)],
                center: .center,
                startRadius: 240,
                endRadius: 640
            )
            .blendMode(.multiply)
        }
        // Clamp to the screen + clip: the oversized clouds must NOT expand the layout,
        // or they'd widen the whole view and shove edge content off-screen.
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
        .ignoresSafeArea()
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 46).repeatForever(autoreverses: true)) { drift = true }
        }
    }

    private func cloud(_ color: Color, size: CGFloat) -> some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .blur(radius: 60)
    }
}
