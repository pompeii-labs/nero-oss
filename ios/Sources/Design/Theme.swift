import SwiftUI

extension Color {
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: 1
        )
    }
    init(r: Double, _ g: Double, _ b: Double, _ a: Double = 1) {
        self.init(.sRGB, red: r / 255, green: g / 255, blue: b / 255, opacity: a)
    }
}

/// A Nero palette. One UI kit; a theme is a palette swap: a dominant holographic
/// light (`holo`), a warm/cool counter-accent (`holo2`), and neutral ground/text.
/// Values are verbatim from web/src/lib/design/themes.css.
struct Theme: Equatable, Identifiable {
    let id: String
    let displayName: String

    let void_: Color
    let text: Color
    let textDim: Color
    let textFaint: Color

    // holo channels kept raw so callers can derive alpha variants
    let holoRGB: (Double, Double, Double)
    let holoSoft: Color
    let holoHot: Color
    let holo2RGB: (Double, Double, Double)

    let fieldStops: [Color]          // radial ground, top -> out
    let panelStops: [Color]          // glass slab gradient
    let orbStops: [Color]            // orb body radial, center -> edge

    func holo(_ a: Double = 1) -> Color { Color(r: holoRGB.0, holoRGB.1, holoRGB.2, a) }
    func holo2(_ a: Double = 1) -> Color { Color(r: holo2RGB.0, holo2RGB.1, holo2RGB.2, a) }

    static func == (l: Theme, r: Theme) -> Bool { l.id == r.id }
}

extension Theme {
    static let forge = Theme(
        id: "forge",
        displayName: "Forge",
        void_: Color(hex: 0x060403),
        text: Color(hex: 0xece4dc),
        textDim: Color(hex: 0x9a8475),
        textFaint: Color(hex: 0x6a5648),
        holoRGB: (251, 146, 60),
        holoSoft: Color(r: 252, 208, 160),
        holoHot: Color(r: 255, 243, 226),
        holo2RGB: (56, 211, 239),
        fieldStops: [Color(hex: 0x120c0a), Color(hex: 0x0c0908), Color(hex: 0x060403)],
        panelStops: [Color(r: 34, 24, 17, 0.6), Color(r: 13, 9, 6, 0.5)],
        orbStops: [Color(hex: 0x2a1d14), Color(hex: 0x150d08), Color(hex: 0x0b0604), Color(hex: 0x060302)]
    )

    /// Instrument blue. Hard electric blue on near-black with a teal counter-accent
    /// and no warm anywhere; the theme the HUD chrome and survey grid belong to.
    static let vector = Theme(
        id: "vector",
        displayName: "Vector",
        void_: Color(hex: 0x01050b),
        text: Color(hex: 0xcfe4f7),
        textDim: Color(hex: 0x6f8ba6),
        textFaint: Color(hex: 0x3f5468),
        holoRGB: (42, 132, 226),
        holoSoft: Color(r: 122, 186, 246),
        holoHot: Color(r: 226, 242, 255),
        holo2RGB: (0, 206, 196),
        fieldStops: [Color(hex: 0x06111f), Color(hex: 0x030a14), Color(hex: 0x01050b)],
        panelStops: [Color(r: 10, 28, 48, 0.66), Color(r: 3, 10, 20, 0.54)],
        orbStops: [Color(hex: 0x10283f), Color(hex: 0x071626), Color(hex: 0x030c16), Color(hex: 0x01060d)]
    )

    /// Vector first: it is the default, and Obsidian is retired.
    static let all: [Theme] = [.vector, .forge]
    /// Anything unknown (a stored "obsidian") lands on the default.
    static func named(_ id: String) -> Theme { all.first { $0.id == id } ?? .vector }
}

// MARK: - Typography (three registers: serif wordmark, sans body, mono labels)

enum Typeface {
    /// Instrument Serif -> New York (system high-contrast serif) for the wordmark/taglines.
    static func display(_ size: CGFloat) -> Font { .system(size: size, weight: .regular, design: .serif) }
    /// Geist -> SF for body/UI.
    static func ui(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight) }
    /// Geist Mono -> SF Mono for labels/status/chips.
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font { .system(size: size, weight: weight, design: .monospaced) }
}

// MARK: - Motion (two signature easings)

enum Motion {
    /// Slow cinematic presence glide.
    static let glide = Animation.timingCurve(0.65, 0, 0.2, 1, duration: 0.85)
    /// Crisp overshoot snap for locks / enters.
    static let snap = Animation.timingCurve(0.16, 1, 0.3, 1, duration: 0.32)
}

// MARK: - Environment plumbing

private struct ThemeKey: EnvironmentKey {
    static let defaultValue: Theme = .vector
}
extension EnvironmentValues {
    var theme: Theme {
        get { self[ThemeKey.self] }
        set { self[ThemeKey.self] = newValue }
    }
}
