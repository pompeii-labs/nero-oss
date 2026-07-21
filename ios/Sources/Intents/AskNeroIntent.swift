import AppIntents
import Foundation

/// A one-off voice errand for Nero. Bind it to the Action Button, Back Tap, or say
/// "Hey Siri, Tell Nero…": dictate a request, it fires in the background (no app UI),
/// and Nero pushes you the result when he's done. No conversation, just the errand.
struct AskNeroIntent: AppIntent {
    static var title: LocalizedStringResource = "Tell Nero"
    static var description = IntentDescription(
        "Fire a one-off request to Nero. He runs it in the background and pushes you when it's done."
    )
    // Run in the background, no foregrounding: this is fire-and-forget.
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Request", requestValueDialog: "What should Nero do?")
    var request: String

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let text = request.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return .result(dialog: "Nothing to send.") }
        guard let base = NeroConfig.serverURL else {
            return .result(dialog: "Nero isn't set up yet. Open the app once first.")
        }
        // Pop the Dynamic Island presence, then fire the errand.
        if #available(iOS 16.2, *) { _ = ErrandActivity.start(text) }
        try await NeroClient(base: base).sendErrand(text)
        return .result(dialog: "On it. I'll ping you when it's done.")
    }
}

/// Registers the Siri phrase + makes the intent discoverable in Shortcuts and the
/// Action Button picker automatically (no manual Shortcut building).
struct NeroAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: AskNeroIntent(),
            phrases: [
                "Tell \(.applicationName)",
                "Ask \(.applicationName)",
                "\(.applicationName) errand",
            ],
            shortTitle: "Tell Nero",
            systemImageName: "mic.fill"
        )
    }
}
