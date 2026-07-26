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
    static let gap = 1.1

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

    func path(in rect: CGRect) -> Path {
        let c = CGPoint(x: rect.midX, y: rect.midY)
        let R = min(rect.width, rect.height) / 2
        let rIn = R * Dial.innerRatio, rOut = R * Dial.outerRatio
        let mid = Dial.angle(slot).degrees
        let a0 = Angle.degrees(mid - Dial.step / 2 + Dial.gap)
        let a1 = Angle.degrees(mid + Dial.step / 2 - Dial.gap)

        var p = Path()
        p.addArc(center: c, radius: rOut, startAngle: a0, endAngle: a1, clockwise: false)
        p.addLine(to: CGPoint(x: c.x + rIn * cos(a1.radians), y: c.y + rIn * sin(a1.radians)))
        p.addArc(center: c, radius: rIn, startAngle: a1, endAngle: a0, clockwise: true)
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
            guard !reduceMotion else { shown = true; return }
            withAnimation(Motion.snap) { shown = true }
        }
    }

    // Each wedge is its own Liquid Glass surface, grouped in a container so the system
    // renders them as one piece of material. No plate underneath: a wedge is a closed
    // shape, so glassEffect clips to it cleanly and the hole stays clear for the orb.
    private var ring: some View {
        GlassEffectContainer(spacing: 2) {
            ZStack {
                ForEach(0..<Dial.slots, id: \.self) { i in
                    let w = wedges[i]
                    AnnularSector(slot: i)
                        .fill(fill(i, w))
                        .overlay(AnnularSector(slot: i).stroke(stroke(i, w), lineWidth: 0.8))
                        .glassEffect(.regular.tint(fill(i, w)), in: AnnularSector(slot: i))
                        // each wedge swings in from behind the one before it, staggered
                        // clockwise, so the ring reads as one sweep from twelve o'clock
                        .rotationEffect(.degrees(shown ? 0 : -16))
                        .opacity(shown ? 1 : 0)
                        .animation(
                            reduceMotion ? nil : Motion.snap.delay(Double(i) * 0.026),
                            value: shown
                        )
                }
            }
        }
    }

    private func fill(_ i: Int, _ w: DialWedge?) -> Color {
        if armed == i { return theme.holo2(0.45) }
        if hot == i { return theme.holo(0.42) }
        if w?.on == true { return theme.holo(0.3) }
        return theme.holo(w == nil ? 0.015 : 0.08)
    }

    private func stroke(_ i: Int, _ w: DialWedge?) -> Color {
        if armed == i { return theme.holo2() }
        if hot == i { return theme.holoSoft.opacity(0.8) }
        if w?.on == true { return theme.holo(0.55) }
        return theme.holo(w == nil ? 0.1 : 0.26)
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
                Text(armed == i ? "CONFIRM" : (w?.label.uppercased() ?? ""))
                    .font(Typeface.mono(8.5)).tracking(1.4)
                    .lineLimit(1)
            }
            .foregroundStyle(labelTint(i, w))
            .frame(width: 76)
            .position(Dial.point(slot: i, center: c, radius: R, ratio: Dial.labelRatio))
            .opacity(shown ? 1 : 0)
            .scaleEffect(shown ? 1 : 0.9)
            .animation(reduceMotion ? nil : Motion.snap.delay(Double(i) * 0.026), value: shown)
        }
    }

    private func labelTint(_ i: Int, _ w: DialWedge?) -> Color {
        if armed == i { return theme.holo2() }
        if hot == i { return theme.text }
        if w?.on == true { return theme.holoSoft }
        return w == nil ? theme.textFaint : theme.textDim
    }
}
