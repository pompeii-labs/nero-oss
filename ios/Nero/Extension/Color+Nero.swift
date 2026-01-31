import SwiftUI

extension Color {
    static let neroBlue = Color(hue: 216/360, saturation: 1.0, brightness: 0.68)
    static let neroCyan = Color(hue: 190/360, saturation: 1.0, brightness: 0.60)
    static let neroPink = Color(hex: "FF00E5")
    static let neroGreen = Color(hex: "00FF94")
    static let neroOrange = Color(hex: "FFB800")

    static let nBackground = Color(hue: 222/360, saturation: 0.25, brightness: 0.03)
    static let nCard = Color(hue: 222/360, saturation: 0.22, brightness: 0.05)
    static let nMuted = Color(hue: 222/360, saturation: 0.20, brightness: 0.08)
    static let nMutedForeground = Color(hue: 215/360, saturation: 0.15, brightness: 0.50)
    static let nBorder = Color(hue: 222/360, saturation: 0.15, brightness: 0.12)
    static let nSuccess = Color(hex: "00FF94")
    static let nError = Color(hex: "FF6B6B")
    static let nWarning = Color(hex: "FFB800")

    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

extension LinearGradient {
    static let neroGradient = LinearGradient(
        colors: [.neroBlue, .neroCyan],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let neroGradientVertical = LinearGradient(
        colors: [.neroBlue, .neroCyan],
        startPoint: .top,
        endPoint: .bottom
    )

    static let neroGradientHorizontal = LinearGradient(
        colors: [.neroBlue, .neroCyan],
        startPoint: .leading,
        endPoint: .trailing
    )

    static let glassBackground = LinearGradient(
        stops: [
            .init(color: Color.neroBlue.opacity(0.08), location: 0),
            .init(color: Color(hue: 222/360, saturation: 0.25, brightness: 0.06).opacity(0.9), location: 0.5),
            .init(color: Color.neroCyan.opacity(0.03), location: 1)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let userMessageBackground = LinearGradient(
        stops: [
            .init(color: Color.neroBlue.opacity(0.35), location: 0),
            .init(color: Color.neroBlue.opacity(0.20), location: 1)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let inputBackground = LinearGradient(
        colors: [
            Color(hue: 222/360, saturation: 0.25, brightness: 0.06).opacity(0.95),
            Color(hue: 222/360, saturation: 0.28, brightness: 0.04).opacity(0.98)
        ],
        startPoint: .top,
        endPoint: .bottom
    )

    static let cardBorder = LinearGradient(
        colors: [
            Color.neroBlue.opacity(0.3),
            Color.neroCyan.opacity(0.15),
            Color.neroBlue.opacity(0.1)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )
}

extension RadialGradient {
    static let neroBackgroundGlow = RadialGradient(
        colors: [Color.neroBlue.opacity(0.12), .clear],
        center: .top,
        startRadius: 0,
        endRadius: 400
    )

    static let neroCyanGlow = RadialGradient(
        colors: [Color.neroCyan.opacity(0.05), .clear],
        center: .bottomTrailing,
        startRadius: 0,
        endRadius: 300
    )

    static let centerGlow = RadialGradient(
        colors: [
            Color.neroBlue.opacity(0.15),
            Color(hex: "FF00E5").opacity(0.05),
            .clear
        ],
        center: .center,
        startRadius: 0,
        endRadius: 400
    )
}

extension AngularGradient {
    static let holoRing = AngularGradient(
        colors: [
            Color.neroBlue.opacity(0.5),
            Color.neroCyan.opacity(0.3),
            Color.neroBlue.opacity(0.1),
            Color.neroCyan.opacity(0.3),
            Color.neroBlue.opacity(0.5)
        ],
        center: .center
    )

    static let multiColorRing = AngularGradient(
        colors: [
            Color(hex: "00D4FF"),
            Color(hex: "FF00E5"),
            Color(hex: "00FF94"),
            Color(hex: "FFB800"),
            Color(hex: "00D4FF")
        ],
        center: .center
    )
}
