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
    @SwiftUI.State private var providers: [ActionProvider] = []
    @SwiftUI.State private var loading = true
    @SwiftUI.State private var picked: ActionTemplate?
    @SwiftUI.State private var values: [String: String] = [:]
    @SwiftUI.State private var label = ""
    @SwiftUI.State private var describe = ""
    @SwiftUI.State private var busy = false

    private static let slotNames = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

    var body: some View {
        NavigationStack {
            Group {
                if let picked {
                    form(for: picked)
                } else if loading {
                    ProgressView().tint(theme.holoSoft)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    list
                }
            }
            .background { Atmosphere() }
            .navigationTitle(picked == nil ? "Bind slot \(slot)" : (picked?.label ?? ""))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(picked == nil ? "Close" : "Back") {
                        if picked == nil { dismiss() } else { picked = nil }
                    }
                    .tint(theme.holoSoft)
                }
            }
        }
        .task {
            let c = await client.actionCatalog()
            templates = c.templates
            providers = c.providers
            loading = false
        }
    }

    // MARK: catalogue

    private var list: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                ForEach(providers) { p in
                    let items = templates.filter { $0.provider == p.id }
                    if !items.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Kicker(text: p.name, size: 9.5)
                            Text(p.description)
                                .font(Typeface.ui(12))
                                .foregroundStyle(theme.textDim)
                            LazyVGrid(
                                columns: [GridItem(.adaptive(minimum: 104), spacing: 8)],
                                spacing: 8
                            ) {
                                ForEach(items) { t in card(t) }
                            }
                        }
                    }
                }

                VStack(alignment: .leading, spacing: 8) {
                    Kicker(text: "Or describe it", size: 9.5)
                    Text("Nero writes the action, runs it until it works, then binds it here.")
                        .font(Typeface.ui(12))
                        .foregroundStyle(theme.textDim)
                    HStack(spacing: 8) {
                        TextField("turn the bedroom lights red", text: $describe)
                            .textFieldStyle(.plain)
                            .font(Typeface.ui(14))
                            .padding(.horizontal, 12).padding(.vertical, 10)
                            .glassEffect(.regular.tint(theme.holo(0.06)), in: .rect(cornerRadius: 10))
                        Button("Ask") {
                            let text = describe.trimmingCharacters(in: .whitespacesAndNewlines)
                            guard !text.isEmpty else { return }
                            onDescribe(text)
                            dismiss()
                        }
                        .font(Typeface.mono(12))
                        .foregroundStyle(theme.holoSoft)
                        .padding(.horizontal, 16).padding(.vertical, 11)
                        .glassEffect(.regular.tint(theme.holo(0.12)).interactive(), in: .capsule)
                        .disabled(describe.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
            }
            .padding(18)
        }
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
            .glassEffect(.regular.tint(theme.holo(0.08)).interactive(), in: .rect(cornerRadius: 12))
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
