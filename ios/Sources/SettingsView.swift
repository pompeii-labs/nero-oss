import SwiftUI

/// Change or clear the server URL.
struct SettingsView: View {
    @Binding var serverURL: String
    @Environment(\.dismiss) private var dismiss

    @State private var draft = ""
    @State private var checking = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Nero server") {
                    TextField("https://nero-rig.tailXXXX.ts.net", text: $draft)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled(true)
                        .keyboardType(.URL)
                    if let errorText {
                        Text(errorText).font(.footnote).foregroundStyle(.red)
                    }
                    Button {
                        save()
                    } label: {
                        HStack {
                            if checking { ProgressView() }
                            Text("Save")
                        }
                    }
                    .disabled(!isValid || checking)
                }

                Section {
                    Button(role: .destructive) {
                        serverURL = ""
                        dismiss()
                    } label: {
                        Text("Disconnect / clear server")
                    }
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear { draft = serverURL }
        }
    }

    private var isValid: Bool {
        NeroClient.normalize(draft) != nil
    }

    private func save() {
        guard isValid, !checking else { return }
        checking = true
        errorText = nil
        Task {
            let ok = await NeroClient.checkHealth(baseURLString: draft)
            await MainActor.run {
                checking = false
                if ok {
                    serverURL = NeroClient.normalize(draft)?.absoluteString ?? draft
                    dismiss()
                } else {
                    errorText = "Could not reach a Nero server at that URL."
                }
            }
        }
    }
}
