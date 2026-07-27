import SwiftUI

/// Binding a dial slot, on the phone. Mirrors web's ActionPicker.svelte: pick a
/// template from the catalogue and fill its params, or describe what you want and
/// let Nero author it.
///
/// Templates whose secret isn't set still show, greyed, naming what they need.
/// Hiding them would make the whole integration invisible until you'd already set up
/// a key you had no reason to know existed.
struct ActionPicker: View {
    @Environment(\.theme) private var theme
    @Environment(\.dismiss) private var dismiss

    let slot: Int
    let client: NeroClient
    /// A template was bound; the Field reloads its actions.
    var onBound: () -> Void
    /// Hand the description to Nero instead.
    var onDescribe: (String) -> Void

    @SwiftUI.State private var templates: [ActionTemplate] = []
    @SwiftUI.State private var library: [DialAction] = []
    @SwiftUI.State private var providers: [ActionProvider] = []
    @SwiftUI.State private var loading = true
    @SwiftUI.State private var picked: ActionTemplate?
    @SwiftUI.State private var values: [String: String] = [:]
    @SwiftUI.State private var label = ""
    @SwiftUI.State private var describe = ""
    @SwiftUI.State private var busy = false
    /// The + in the header swaps the sheet over to a single describe field.
    @SwiftUI.State private var describing = false

    private static let slotNames = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

    var body: some View {
        NavigationStack {
            Group {
                if describing {
                    describeView
                } else if let picked {
                    form(for: picked)
                } else if loading {
                    ProgressView().tint(theme.holoSoft)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    list
                }
            }
            // Deliberately NOT Atmosphere(): its drifting clouds animate forever, and
            // every glass surface above them re-blurs its backdrop each frame. A sheet
            // is transient; a static ground keeps the grid smooth.
            .background {
                RadialGradient(
                    colors: theme.fieldStops,
                    center: .init(x: 0.5, y: -0.1),
                    startRadius: 0,
                    endRadius: 900
                )
                .ignoresSafeArea()
            }
            .navigationTitle(picked == nil ? "Bind slot \(slot)" : (picked?.label ?? ""))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if picked != nil || describing {
                        Button("Back") {
                            picked = nil
                            describing = false
                        }
                        .tint(theme.holoSoft)
                    } else {
                        Button { dismiss() } label: { Image(systemName: "xmark") }
                            .tint(theme.holoSoft)
                    }
                }
                ToolbarItem(placement: .primaryAction) {
                    if picked == nil && !describing {
                        Button { describing = true } label: { Image(systemName: "plus") }
                            .tint(theme.holoSoft)
                    }
                }
            }
        }
        .task {
            // Cleared every time the sheet opens. SwiftUI can reuse this view, and a
            // leftover goal from a previous open would be sent as if you'd typed it.
            describe = ""
            describing = false
            picked = nil
            await reload()
        }
    }

    private func reload() async {
        async let cat = client.actionCatalog()
        async let mine = client.actions()
        let (c, m) = await (cat, mine)
        templates = c.templates
        providers = c.providers
        library = m
        loading = false
    }

    /// What currently holds this slot, if anything.
    private var occupant: DialAction? { library.first { $0.slot == slot } }

    // MARK: catalogue

    private var list: some View {
        ScrollView {
            // spacing 0: these are separate chips, they must not merge into each other
            GlassEffectContainer(spacing: 0) {
                VStack(alignment: .leading, spacing: 22) {
                if let occ = occupant {
                    VStack(alignment: .leading, spacing: 8) {
                        Kicker(text: "In this slot", size: 9.5)
                        HStack {
                            Text(occ.label).font(Typeface.ui(14)).foregroundStyle(theme.text)
                            Spacer()
                            Button("Unassign") {
                                Task {
                                    _ = await client.assignAction(occ.id, slot: -1)
                                    await reload()
                                    onBound()
                                }
                            }
                            .font(Typeface.mono(10)).foregroundStyle(theme.textDim)
                            Button("Delete") {
                                Task {
                                    _ = await client.deleteAction(occ.id)
                                    await reload()
                                    onBound()
                                }
                            }
                            .font(Typeface.mono(10)).foregroundStyle(theme.holo2())
                        }
                        .padding(.horizontal, 12).padding(.vertical, 10)
                        .glassEffect(.regular.tint(theme.holo(0.10)), in: .rect(cornerRadius: 12))
                        Text("Unassigning frees the slot and keeps the action. Deleting removes it.")
                            .font(Typeface.ui(11)).foregroundStyle(theme.textFaint)
                    }
                }

                ForEach(providers) { p in
                    let items = templates.filter { $0.provider == p.id }
                    if !items.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Kicker(text: p.name, size: 9.5)
                            Text(p.description)
                                .font(Typeface.ui(12))
                                .foregroundStyle(theme.textDim)
                            LazyVGrid(
                                columns: Array(
                                    repeating: GridItem(.flexible(), spacing: 8), count: 3),
                                spacing: 8
                            ) {
                                ForEach(items) { t in card(t) }
                            }
                        }
                    }
                }

                let others = library.filter { $0.slot != slot }
                if !others.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Kicker(text: "Custom", size: 9.5)
                        Text("Everything you and Nero have built.")
                            .font(Typeface.ui(12)).foregroundStyle(theme.textDim)
                        LazyVGrid(
                            columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 3),
                            spacing: 8
                        ) {
                            ForEach(others) { a in customCard(a) }
                        }
                    }
                }
                }
            }
            .padding(18)
        }
    }

    private var describeView: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Say what the button should do. Nero writes it, runs it until it works, then binds it to slot \(slot).")
                .font(Typeface.ui(13)).foregroundStyle(theme.textDim)
            TextField("turn the bedroom lights red", text: $describe, axis: .vertical)
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
                .font(Typeface.ui(15))
                .padding(.horizontal, 12).padding(.vertical, 11)
                .glassEffect(.regular.tint(theme.holo(0.06)), in: .rect(cornerRadius: 12))
            Button {
                let text = describe.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { return }
                onDescribe(text)
                describe = ""
                dismiss()
            } label: {
                Text("Ask Nero")
                    .font(Typeface.mono(12)).tracking(1)
                    .foregroundStyle(theme.holoSoft)
                    .frame(maxWidth: .infinity).padding(.vertical, 13)
                    .glassEffect(
                        .regular.tint(theme.holo(0.16)).interactive(), in: .rect(cornerRadius: 12))
            }
            .buttonStyle(PressableButtonStyle(haptic: true))
            .disabled(describe.trimmingCharacters(in: .whitespaces).isEmpty)
            Spacer()
        }
        .padding(18)
    }

    private func customCard(_ a: DialAction) -> some View {
        Button {
            Task {
                _ = await client.assignAction(a.id, slot: slot)
                onBound()
                dismiss()
            }
        } label: {
            VStack(spacing: 6) {
                Image(systemName: DialIcon.symbol(a.icon))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(theme.holoSoft)
                Text(a.label.uppercased())
                    .font(Typeface.mono(9.5)).tracking(1)
                    .foregroundStyle(theme.text)
                    .lineLimit(1)
                Text(a.slot >= 0 ? "slot \(a.slot)" : "free")
                    .font(Typeface.mono(7.5)).foregroundStyle(theme.textFaint)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12).padding(.horizontal, 8)
            .glassEffect(.regular.tint(theme.holo(0.08)), in: .rect(cornerRadius: 12))
        }
        .buttonStyle(PressableButtonStyle())
        .disabled(busy)
    }

    private func card(_ t: ActionTemplate) -> some View {
        Button {
            picked = t
            label = t.label
            values = Dictionary(uniqueKeysWithValues: t.params.map { ($0.key, $0.default ?? "") })
        } label: {
            VStack(spacing: 6) {
                Image(systemName: DialIcon.symbol(t.icon))
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(theme.holoSoft)
                Text(t.label.uppercased())
                    .font(Typeface.mono(9.5)).tracking(1)
                    .foregroundStyle(theme.text)
                if !t.available {
                    Text("needs \(t.missing.joined(separator: ", "))")
                        .font(Typeface.mono(7.5))
                        .foregroundStyle(theme.holo2())
                        .multilineTextAlignment(.center)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12).padding(.horizontal, 8)
            .glassEffect(.regular.tint(theme.holo(0.08)), in: .rect(cornerRadius: 12))
            .opacity(t.available ? 1 : 0.55)
        }
        .buttonStyle(PressableButtonStyle())
    }

    // MARK: param form

    private func form(for t: ActionTemplate) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(t.description)
                    .font(Typeface.ui(13))
                    .foregroundStyle(theme.textDim)

                if !t.available {
                    Text(
                        "Needs \(t.missing.joined(separator: ", ")). It'll bind anyway and start working once you set that in Settings."
                    )
                    .font(Typeface.ui(12))
                    .foregroundStyle(theme.text)
                    .padding(10)
                    .background(theme.holo2(0.1), in: .rect(cornerRadius: 8))
                }

                field("Label on the dial", text: $label, hint: nil)

                ForEach(t.params) { p in
                    if let options = p.options {
                        VStack(alignment: .leading, spacing: 4) {
                            Kicker(text: p.label, size: 9)
                            Picker(p.label, selection: binding(for: p.key)) {
                                ForEach(options, id: \.self) { Text($0).tag($0) }
                            }
                            .pickerStyle(.segmented)
                            Text(p.description)
                                .font(Typeface.ui(11)).foregroundStyle(theme.textFaint)
                        }
                    } else {
                        field(
                            p.label + (p.required == true ? " *" : ""),
                            text: binding(for: p.key),
                            hint: p.description
                        )
                    }
                }

                Button {
                    Task {
                        busy = true
                        let ok = await client.bindTemplate(
                            t.id,
                            slot: slot,
                            label: label.isEmpty ? t.label : label,
                            params: values
                        )
                        busy = false
                        if ok {
                            onBound()
                            dismiss()
                        }
                    }
                } label: {
                    Text(busy ? "binding…" : "Bind to slot \(slot)")
                        .font(Typeface.mono(12)).tracking(1)
                        .foregroundStyle(theme.holoSoft)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .glassEffect(
                            .regular.tint(theme.holo(0.16)).interactive(),
                            in: .rect(cornerRadius: 12)
                        )
                }
                .buttonStyle(PressableButtonStyle(haptic: true))
                .disabled(busy)
            }
            .padding(18)
        }
    }

    private func binding(for key: String) -> Binding<String> {
        Binding(get: { values[key] ?? "" }, set: { values[key] = $0 })
    }

    private func field(_ title: String, text: Binding<String>, hint: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Kicker(text: title, size: 9)
            TextField("", text: text)
                .textFieldStyle(.plain)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
                .font(Typeface.ui(14))
                .foregroundStyle(theme.text)
                .padding(.horizontal, 12).padding(.vertical, 10)
                .glassEffect(.regular.tint(theme.holo(0.06)), in: .rect(cornerRadius: 10))
            if let hint {
                Text(hint).font(Typeface.ui(11)).foregroundStyle(theme.textFaint)
            }
        }
    }
}
