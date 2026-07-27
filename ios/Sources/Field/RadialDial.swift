import SwiftUI

/// The dial: eight wedges ringing the orb, slot 0 at twelve o'clock going clockwise.
/// A wedge is either a built-in the app owns or an action Nero authored; an empty one
/// is an invitation to ask for the button you want.
///
/// Press and hold the orb to bloom it open, drag to a wedge, release to fire. The
/// light under your thumb snaps between wedges rather than trailing it, and each
/// crossing ticks the Taptic Engine, so the ring feels detented.
/// Ported from web/src/lib/components/field/RadialMenu.svelte.

// MARK: - Geometry

enum Dial {
    static let slots = 8
    static let step = 360.0 / Double(slots)
    /// Radii as a fraction of the dial's half-width, matching the web's 52/96 of 100.
    static let innerRatio: CGFloat = 0.52
    static let outerRatio: CGFloat = 0.96
    static var labelRatio: CGFloat { (innerRatio + outerRatio) / 2 }
    /// Degrees trimmed off each side of a wedge so they read as separate.
    static let gap = 2.2

    /// Centre angle of a slot. SwiftUI's zero is the +x axis, so twelve o'clock is -90.
    static func angle(_ slot: Int) -> Angle { .degrees(-90 + Double(slot) * step) }

    /// Which slot a point falls in, or nil when it's in the hole or outside the ring.
    static func slot(at p: CGPoint, center c: CGPoint, radius R: CGFloat) -> Int? {
        let dx = p.x - c.x, dy = p.y - c.y
        let dist = (dx * dx + dy * dy).squareRoot()
        guard dist >= R * innerRatio - 6, dist <= R * outerRatio + 14 else { return nil }
        let deg = atan2(dy, dx) * 180 / .pi + 90
        return Int((deg.truncatingRemainder(dividingBy: 360) + 360)
            .truncatingRemainder(dividingBy: 360) / step + 0.5) % slots
    }

    static func point(slot: Int, center c: CGPoint, radius R: CGFloat, ratio: CGFloat) -> CGPoint {
        let a = angle(slot).radians
        return CGPoint(x: c.x + R * ratio * cos(a), y: c.y + R * ratio * sin(a))
    }
}

/// One wedge of the ring: an arc band between two radii.
struct AnnularSector: Shape {
    let slot: Int
    /// Corner softness. Liquid Glass computes its lensing from the shape it is given;
    /// a sharp-cornered pie slice degrades to a flat translucent fill that reads as
    /// gray, so the corners are generously rounded like every native glass surface.
    var corner: CGFloat = 14

    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let R = min(rect.width, rect.height) / 2
        let rIn = R * Dial.innerRatio
        let rOut = R * Dial.outerRatio
        let mid = Dial.angle(slot).radians
        let half = (Dial.step / 2 - Dial.gap) * .pi / 180
        let a0 = mid - half
        let a1 = mid + half

        // Never let the fillet exceed half the band or half the arc.
        let cr = min(corner, (rOut - rIn) / 2.2, rIn * half / 1.2)
        let dOut = cr / rOut
        let dIn = cr / rIn

        func pt(_ r: CGFloat, _ a: CGFloat) -> CGPoint {
            CGPoint(x: c.x + r * cos(a), y: c.y + r * sin(a))
        }

        var p = Path()
        p.move(to: pt(rOut, a0 + dOut))
        p.addArc(
            center: c, radius: rOut,
            startAngle: .radians(a0 + dOut), endAngle: .radians(a1 - dOut),
            clockwise: false
        )
        // round into the trailing radial edge
        p.addQuadCurve(to: pt(rOut - cr, a1), control: pt(rOut, a1))
        p.addLine(to: pt(rIn + cr, a1))
        p.addQuadCurve(to: pt(rIn, a1 - dIn), control: pt(rIn, a1))
        p.addArc(
            center: c, radius: rIn,
            startAngle: .radians(a1 - dIn), endAngle: .radians(a0 + dIn),
            clockwise: true
        )
        p.addQuadCurve(to: pt(rIn + cr, a0), control: pt(rIn, a0))
        p.addLine(to: pt(rOut - cr, a0))
        p.addQuadCurve(to: pt(rOut, a0 + dOut), control: pt(rOut, a0))
        p.closeSubpath()
        return p
    }
}

// MARK: - Model

struct DialWedge: Identifiable, Equatable {
    /// Action id for custom wedges, builtin key for built-ins.
    let id: String
    let label: String
    /// SF Symbol name.
    let icon: String
    var custom: Bool = false
    /// Renders filled, for capabilities that are currently on.
    var on: Bool = false
    /// Needs a second press before it fires.
    var confirm: Bool = false
    /// Nero is still building this one, or couldn't.
    var status: String = "ready"

    var building: Bool { status == "drafting" || status == "testing" }
    var broke: Bool { status == "failed" }
}

enum DialIcon {
    /// Icon keys the server hands back, mapped to SF Symbols.
    static func symbol(_ key: String) -> String {
        switch key {
        case "terminal": return "terminal"
        case "play": return "play.fill"
        case "refresh": return "arrow.clockwise"
        case "moon": return "moon.fill"
        case "music": return "music.note"
        case "camera": return "camera.fill"
        case "chat": return "text.bubble"
        case "mic": return "mic.fill"
        case "globe": return "globe"
        case "home": return "house.fill"
        case "lock": return "lock.fill"
        case "wave": return "waveform"
        case "palette": return "paintpalette"
        case "settings": return "gearshape"
        case "wrench": return "wrench.and.screwdriver"
        case "radio": return "dot.radiowaves.left.and.right"
        default: return "bolt.fill"
        }
    }
}

// MARK: - View

struct RadialDial: View {
    @Environment(\.theme) private var theme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Exactly `Dial.slots` entries; nil is an empty slot.
    let wedges: [DialWedge?]
    let hot: Int?
    let armed: Int?
    var status: String = ""
    var diameter: CGFloat = 340
    /// Drives the clockwise sweep-in.
    @SwiftUI.State private var shown = false
    @SwiftUI.State private var pulse = false

    var body: some View {
        ZStack {
            ring
            light
            labels
            if !status.isEmpty {
                Text(status)
                    .font(Typeface.mono(10)).tracking(3)
                    .foregroundStyle(theme.holoSoft.opacity(0.9))
            }
        }
        .frame(width: diameter, height: diameter)
        .onAppear {
            guard !reduceMotion else {
                shown = true
                return
            }
            withAnimation(Motion.snap) { shown = true }
            withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
    }

    /// The one lit wedge, if any. Armed beats hot. Deriving it once means two wedges
    /// can't both look selected, which is what the old per-wedge fill allowed.
    private var lit: (slot: Int, fill: Color, edge: Color)? {
        if let armed { return (armed, theme.holo2(0.5), theme.holo2()) }
        if let hot { return (hot, theme.holo(0.5), theme.holoSoft.opacity(0.85)) }
        return nil
    }

    // Deliberately NOT in a GlassEffectContainer: that merges glass shapes within its
    // spacing, and eight touching wedges get blended into one blob that bleeds tint
    // into its neighbours. Uniform untinted material per wedge, then a single
    // highlight layer on top.
    private var ring: some View {
        ZStack {
            ForEach(0..<Dial.slots, id: \.self) { i in
                // Tinted, like every other glass surface in the app. Untinted
                // .regular renders as neutral system gray, which reads as off-brand
                // against the Field's palette.
                AnnularSector(slot: i)
                    .fill(.clear)
                    .glassEffect(
                        .regular.tint(theme.holo(wedges[i] == nil ? 0.07 : 0.16)).interactive(),
                        in: AnnularSector(slot: i)
                    )
            }

            // "on" capabilities read as a quiet wash, well below the selection, so an
            // active toggle is never mistaken for the thing under your thumb
            ForEach(0..<Dial.slots, id: \.self) { i in
                if wedges[i]?.on == true {
                    AnnularSector(slot: i).fill(theme.holo(0.14))
                }
                // Nero is writing this one. Without the pulse a slot you handed him
                // looks identical to one sitting dead.
                if wedges[i]?.building == true {
                    AnnularSector(slot: i)
                        .fill(theme.holo(0.22))
                        .opacity(pulse ? 1 : 0.35)
                }
                if wedges[i]?.broke == true {
                    AnnularSector(slot: i).fill(theme.holo2(0.2))
                }
            }

            // The selection is its own glass, brighter and lifted, rather than a fill
            // with a hard stroke on top. Native glass draws its own edge; outlining it
            // is what made these read as flat shapes.
            if let lit {
                AnnularSector(slot: lit.slot)
                    .fill(.clear)
                    .glassEffect(
                        .regular.tint(lit.fill).interactive(),
                        in: AnnularSector(slot: lit.slot)
                    )
                    .shadow(color: theme.holo(0.45), radius: 14)
            }
        }
        // one transform on the whole ring. Rotating each sector individually slid it
        // along the arc, which smeared rather than swept.
        .scaleEffect(shown ? 1 : 0.93)
        .opacity(shown ? 1 : 0)
        .animation(reduceMotion ? nil : Motion.snap, value: shown)
    }

    /// The light under your thumb. It snaps to the hot wedge instead of trailing the
    /// touch, which is what makes the ring feel detented.
    private var light: some View {
        let R = diameter / 2
        let c = CGPoint(x: R, y: R)
        let p = hot.map { Dial.point(slot: $0, center: c, radius: R, ratio: Dial.labelRatio) } ?? c
        return Circle()
            .fill(RadialGradient(
                colors: [theme.holoSoft.opacity(0.5), theme.holo(0.28), .clear],
                center: .center, startRadius: 0, endRadius: diameter * 0.17))
            .frame(width: diameter * 0.34, height: diameter * 0.34)
            .blur(radius: 6)
            .position(p)
            .opacity(hot == nil ? 0 : 1)
            .animation(reduceMotion ? nil : .spring(response: 0.22, dampingFraction: 0.78), value: hot)
    }

    private var labels: some View {
        let R = diameter / 2
        let c = CGPoint(x: R, y: R)
        return ForEach(0..<Dial.slots, id: \.self) { i in
            let w = wedges[i]
            VStack(spacing: 5) {
                Image(systemName: w?.icon ?? "plus")
                    .font(.system(size: 15, weight: .medium))
                Text(
                    armed == i
                        ? "CONFIRM"
                        : (w?.building == true ? "BUILDING…" : (w?.label.uppercased() ?? ""))
                )
                    .font(Typeface.mono(8.5)).tracking(1.4)
                    .lineLimit(1)
            }
            .foregroundStyle(labelTint(i, w))
            .frame(width: 76)
            .position(Dial.point(slot: i, center: c, radius: R, ratio: Dial.labelRatio))
            // opacity only, staggered clockwise: transforms on a positioned view fight
            // the .position and read as jitter
            .opacity(shown ? 1 : 0)
            .animation(
                reduceMotion ? nil : .easeOut(duration: 0.2).delay(Double(i) * 0.022),
                value: shown
            )
        }
    }

    private func labelTint(_ i: Int, _ w: DialWedge?) -> Color {
        if lit?.slot == i { return armed == i ? theme.holo2() : theme.text }
        if w?.building == true { return theme.holoSoft }
        if w?.broke == true { return theme.holo2() }
        if w?.on == true { return theme.holoSoft.opacity(0.85) }
        return w == nil ? theme.textFaint : theme.textDim
    }
}
