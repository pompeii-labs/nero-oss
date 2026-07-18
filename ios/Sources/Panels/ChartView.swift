import SwiftUI
import Charts

/// Panel `chart` component. Plots a `data` series (line/area/bar). A live scalar
/// `value` with no series falls back to a big number (full rolling-buffer sampling
/// is a later refinement; ports web/src/lib/panels/chart.ts).
struct ChartView: View {
    @Environment(\.theme) private var theme
    let comp: Comp
    let state: [String: JSONValue]

    var body: some View {
        let data = comp.data?.numbers(state) ?? []
        let height = comp.height ?? 90
        if data.isEmpty {
            Text(comp.value?.string(state) ?? "—")
                .font(Typeface.display(26))
                .foregroundStyle(theme.text)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Chart(Array(data.enumerated()), id: \.offset) { index, value in
                let x = PlottableValue.value("i", index)
                let y = PlottableValue.value("v", value)
                if comp.kind == "bar" {
                    BarMark(x: x, y: y).foregroundStyle(theme.holo())
                } else if comp.kind == "area" {
                    AreaMark(x: x, y: y)
                        .foregroundStyle(theme.holo(0.3))
                    LineMark(x: x, y: y).foregroundStyle(theme.holo())
                } else {
                    LineMark(x: x, y: y)
                        .interpolationMethod(.catmullRom)
                        .foregroundStyle(theme.holo())
                }
            }
            .chartXAxis(.hidden)
            .chartYAxis(.hidden)
            .frame(height: height)
        }
    }
}

extension JSONValue {
    /// For handing a bound `value` back to the interact endpoint as plain JSON.
    var anyValue: Any {
        switch self {
        case .string(let s): return s
        case .number(let n): return n
        case .bool(let b): return b
        case .array(let a): return a.map(\.anyValue)
        case .object(let o): return o.mapValues(\.anyValue)
        case .null: return NSNull()
        }
    }
}
