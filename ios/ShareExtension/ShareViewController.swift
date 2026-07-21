import UIKit
import UniformTypeIdentifiers

/// "Send to Nero": grabs the shared text or URL and fires it as a background errand,
/// then dismisses. Self-contained, it reads the server URL from the shared App Group
/// so it needs none of the main app's code.
final class ShareViewController: UIViewController {
    private let appGroup = "group.com.pompeii.nero"
    private let serverKey = "nero.serverURL"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        Task { await run() }
    }

    private func run() async {
        let text = await extractText()
        if let text, !text.isEmpty, let base = serverURL() {
            await send(text: text, base: base)
        }
        await MainActor.run { self.extensionContext?.completeRequest(returningItems: nil) }
    }

    private func serverURL() -> URL? {
        // The main app primes this in the shared suite on launch.
        guard let s = UserDefaults(suiteName: appGroup)?.string(forKey: serverKey),
            !s.isEmpty
        else { return nil }
        return URL(string: s)
    }

    private func extractText() async -> String? {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return nil }
        for item in items {
            for provider in item.attachments ?? [] {
                if let s = await load(provider, UTType.url.identifier) as? URL {
                    return s.absoluteString
                }
                if let s = await load(provider, UTType.plainText.identifier) as? String {
                    return s
                }
            }
            if let s = item.attributedContentText?.string, !s.isEmpty { return s }
        }
        return nil
    }

    private func load(_ p: NSItemProvider, _ type: String) async -> NSSecureCoding? {
        guard p.hasItemConformingToTypeIdentifier(type) else { return nil }
        return await withCheckedContinuation { cont in
            p.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                cont.resume(returning: item)
            }
        }
    }

    private func send(text: String, base: URL) async {
        var req = URLRequest(url: base.appendingPathComponent("v1/nero"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(
            withJSONObject: ["text": text, "errand": true]
        )
        _ = try? await URLSession.shared.data(for: req)
    }
}
