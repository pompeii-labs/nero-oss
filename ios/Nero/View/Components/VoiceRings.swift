import SwiftUI

struct VoiceRings: View {
    let isActive: Bool
    let rmsLevel: Float
    let isSpeaking: Bool

    @State private var rotation: Double = 0
    @State private var innerRotation: Double = 0
    @State private var pulsePhase: CGFloat = 0

    var body: some View {
        ZStack {
            outerGlow

            ForEach(0..<3, id: \.self) { index in
                ring(index: index)
            }

            innerCore
        }
        .onAppear {
            withAnimation(.linear(duration: 20).repeatForever(autoreverses: false)) {
                rotation = 360
            }
            withAnimation(.linear(duration: 12).repeatForever(autoreverses: false)) {
                innerRotation = -360
            }
            withAnimation(.easeInOut(duration: 2).repeatForever(autoreverses: true)) {
                pulsePhase = 1
            }
        }
    }

    private var outerGlow: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [
                        Color.neroBlue.opacity(isActive ? 0.2 : 0.05),
                        Color.neroCyan.opacity(isActive ? 0.08 : 0),
                        .clear
                    ],
                    center: .center,
                    startRadius: 40,
                    endRadius: 140
                )
            )
            .scaleEffect(1.0 + CGFloat(rmsLevel) * 0.2)
            .blur(radius: 20)
    }

    private func ring(index: Int) -> some View {
        let baseScale = 0.5 + Double(index) * 0.2
        let rmsBoost = isActive ? Double(rmsLevel) * 0.12 * Double(3 - index) : 0
        let tiltAngle = Double(index) * 12.0
        let speed = index % 2 == 0 ? 1.0 : -0.7
        let rotationOffset = Double(index) * 60.0

        return Ellipse()
            .stroke(
                AngularGradient(
                    stops: [
                        .init(color: Color.neroBlue.opacity(isActive ? 0.6 : 0.15), location: 0),
                        .init(color: Color.neroCyan.opacity(isActive ? 0.3 : 0.08), location: 0.25),
                        .init(color: .clear, location: 0.5),
                        .init(color: Color.neroCyan.opacity(isActive ? 0.3 : 0.08), location: 0.75),
                        .init(color: Color.neroBlue.opacity(isActive ? 0.6 : 0.15), location: 1)
                    ],
                    center: .center,
                    startAngle: .degrees(rotationOffset),
                    endAngle: .degrees(rotationOffset + 360)
                ),
                style: StrokeStyle(lineWidth: 2.0 - Double(index) * 0.3, lineCap: .round)
            )
            .frame(width: 180, height: 180)
            .scaleEffect(baseScale + rmsBoost)
            .rotation3DEffect(.degrees(tiltAngle), axis: (x: 1, y: 0.2, z: 0))
            .rotationEffect(.degrees(rotation * speed + rotationOffset))
            .shadow(color: Color.neroBlue.opacity(isActive ? 0.4 : 0.1), radius: isActive ? 6 : 2)
            .animation(.easeOut(duration: 0.08), value: rmsLevel)
    }

    private var innerCore: some View {
        ZStack {
            Circle()
                .fill(
                    RadialGradient(
                        stops: [
                            .init(color: Color(hex: "0A0A0F"), location: 0),
                            .init(color: Color(hex: "12121A"), location: 0.7),
                            .init(color: Color(hex: "1A1A2E"), location: 1)
                        ],
                        center: .center,
                        startRadius: 0,
                        endRadius: 50
                    )
                )
                .frame(width: 100, height: 100)
                .overlay(
                    Circle()
                        .stroke(
                            AngularGradient(
                                colors: [Color.neroBlue, Color.neroCyan, Color.neroBlue],
                                center: .center
                            ),
                            lineWidth: isActive ? 2 : 1.5
                        )
                        .rotationEffect(.degrees(innerRotation))
                )
                .shadow(
                    color: Color.neroBlue.opacity(isActive ? 0.5 : 0.1),
                    radius: isActive ? 15 + CGFloat(rmsLevel) * 10 : 5
                )

            coreIcon
        }
        .scaleEffect(1.0 + CGFloat(rmsLevel) * 0.1)
        .animation(.easeOut(duration: 0.08), value: rmsLevel)
    }

    private var coreIcon: some View {
        ZStack {
            if isSpeaking {
                HStack(spacing: 3) {
                    ForEach(0..<5, id: \.self) { i in
                        RoundedRectangle(cornerRadius: 2)
                            .fill(
                                LinearGradient(
                                    colors: [Color.neroBlue, Color.neroCyan],
                                    startPoint: .bottom,
                                    endPoint: .top
                                )
                            )
                            .frame(width: 4, height: 10 + CGFloat(rmsLevel) * 20 * (i == 2 ? 1.5 : (i == 1 || i == 3 ? 1.2 : 0.8)))
                            .animation(
                                .easeInOut(duration: 0.1).delay(Double(i) * 0.02),
                                value: rmsLevel
                            )
                    }
                }
                .shadow(color: Color.neroCyan.opacity(0.6), radius: 6)
            } else {
                Image(systemName: isActive ? "mic.fill" : "mic")
                    .font(.system(size: 32, weight: .light))
                    .foregroundStyle(
                        isActive
                            ? LinearGradient(colors: [Color.neroBlue, Color.neroCyan], startPoint: .top, endPoint: .bottom)
                            : LinearGradient(colors: [Color(hex: "6A6A7A"), Color(hex: "4A4A5A")], startPoint: .top, endPoint: .bottom)
                    )
                    .shadow(color: isActive ? Color.neroBlue.opacity(0.5) : .clear, radius: 6)
            }
        }
    }
}

#Preview {
    ZStack {
        Color(hex: "0A0A0F").ignoresSafeArea()

        VStack(spacing: 80) {
            VoiceRings(isActive: false, rmsLevel: 0, isSpeaking: false)
                .frame(width: 220, height: 220)

            VoiceRings(isActive: true, rmsLevel: 0.5, isSpeaking: false)
                .frame(width: 220, height: 220)

            VoiceRings(isActive: true, rmsLevel: 0.7, isSpeaking: true)
                .frame(width: 220, height: 220)
        }
    }
}
