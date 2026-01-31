import SwiftUI

extension View {
    func glassPanel() -> some View {
        self
            .background(LinearGradient.glassBackground)
            .clipShape(RoundedRectangle(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(Color.neroBlue.opacity(0.15), lineWidth: 1)
            )
            .shadow(color: Color.neroBlue.opacity(0.3), radius: 30, x: 0, y: 0)
            .shadow(color: Color.black.opacity(0.8), radius: 16, x: 0, y: 8)
    }

    func glassCard() -> some View {
        self
            .background(
                ZStack {
                    Color.nCard
                    LinearGradient(
                        colors: [Color.neroBlue.opacity(0.05), Color.clear],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(
                        LinearGradient(
                            colors: [
                                Color.neroBlue.opacity(0.3),
                                Color.neroBlue.opacity(0.1),
                                Color.clear,
                                Color.neroCyan.opacity(0.1),
                                Color.neroCyan.opacity(0.2)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        lineWidth: 1
                    )
            )
            .shadow(color: Color.black.opacity(0.5), radius: 8, x: 0, y: 4)
    }

    func inputGlow(isFocused: Bool = false) -> some View {
        self
            .background(LinearGradient.inputBackground)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.neroBlue.opacity(isFocused ? 0.4 : 0.2), lineWidth: 1)
            )
            .shadow(color: Color.neroBlue.opacity(isFocused ? 0.3 : 0.15), radius: isFocused ? 20 : 10, x: 0, y: -4)
            .shadow(color: Color.black.opacity(0.8), radius: 10, x: 0, y: 4)
    }

    func neroButton() -> some View {
        self
            .font(.headline)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(LinearGradient.neroGradient)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .shadow(color: Color.neroBlue.opacity(0.5), radius: 12, x: 0, y: 4)
            .shadow(color: Color.neroCyan.opacity(0.3), radius: 20, x: 0, y: 8)
    }

    func neroSecondaryButton() -> some View {
        self
            .font(.headline)
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(Color.nCard)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.nBorder, lineWidth: 1)
            )
    }

    func neroGlow() -> some View {
        self
            .shadow(color: Color.neroBlue.opacity(0.5), radius: 8, x: 0, y: 0)
            .shadow(color: Color.neroBlue.opacity(0.3), radius: 20, x: 0, y: 0)
    }

    func neroGlowStrong() -> some View {
        self
            .shadow(color: Color.neroBlue.opacity(0.7), radius: 12, x: 0, y: 0)
            .shadow(color: Color.neroBlue.opacity(0.4), radius: 30, x: 0, y: 0)
    }

    func neroGlowSubtle() -> some View {
        self
            .shadow(color: Color.neroBlue.opacity(0.4), radius: 4, x: 0, y: 0)
    }

    func messageAppear(isUser: Bool, index: Int) -> some View {
        self.modifier(MessageAppearModifier(isUser: isUser, delay: Double(index) * 0.05))
    }

    func floatUp(delay: Double = 0) -> some View {
        self.modifier(FloatUpModifier(delay: delay))
    }

    func pulseGlow() -> some View {
        self.modifier(PulseGlowModifier())
    }

    func holoRing() -> some View {
        self.modifier(HoloRingModifier())
    }
}

struct MessageAppearModifier: ViewModifier {
    let isUser: Bool
    let delay: Double

    @State private var appeared = false

    func body(content: Content) -> some View {
        content
            .opacity(appeared ? 1 : 0)
            .offset(
                x: appeared ? 0 : (isUser ? 12 : -12),
                y: appeared ? 0 : 16
            )
            .scaleEffect(appeared ? 1 : 0.98)
            .onAppear {
                withAnimation(.spring(response: 0.4, dampingFraction: 0.8).delay(delay)) {
                    appeared = true
                }
            }
    }
}

struct FloatUpModifier: ViewModifier {
    let delay: Double

    @State private var appeared = false

    func body(content: Content) -> some View {
        content
            .opacity(appeared ? 1 : 0)
            .offset(y: appeared ? 0 : 20)
            .onAppear {
                withAnimation(.spring(response: 0.5, dampingFraction: 0.8).delay(delay)) {
                    appeared = true
                }
            }
    }
}

struct PulseGlowModifier: ViewModifier {
    @State private var isPulsing = false

    func body(content: Content) -> some View {
        content
            .shadow(color: Color.neroBlue.opacity(isPulsing ? 0.7 : 0.5), radius: isPulsing ? 16 : 8, x: 0, y: 0)
            .shadow(color: Color.neroBlue.opacity(isPulsing ? 0.4 : 0.3), radius: isPulsing ? 40 : 20, x: 0, y: 0)
            .onAppear {
                withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) {
                    isPulsing = true
                }
            }
    }
}

struct HoloRingModifier: ViewModifier {
    @State private var rotation: Double = 0

    func body(content: Content) -> some View {
        content
            .background(
                Circle()
                    .stroke(AngularGradient.holoRing, lineWidth: 2)
                    .rotationEffect(.degrees(rotation))
                    .opacity(0.6)
                    .blur(radius: 1)
            )
            .onAppear {
                withAnimation(.linear(duration: 8).repeatForever(autoreverses: false)) {
                    rotation = 360
                }
            }
    }
}

struct NeroBackgroundView: View {
    var body: some View {
        ZStack {
            Color.nBackground

            RadialGradient.neroBackgroundGlow
                .offset(y: -200)

            RadialGradient.neroCyanGlow
                .offset(x: 100, y: 300)

            VStack {
                Spacer()
                LinearGradient(
                    colors: [
                        Color.clear,
                        Color.neroBlue.opacity(0.03),
                        Color.neroCyan.opacity(0.05)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 200)
                .blur(radius: 30)
            }
        }
        .ignoresSafeArea()
    }
}
