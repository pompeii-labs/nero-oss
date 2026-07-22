import UIKit
import UniformTypeIdentifiers

/// "Send to Nero": grabs shared text, a URL, or photos and fires them at Nero as a
/// background errand, then dismisses. Self-contained, it reads the server URL from the
/// shared App Group so it needs none of the main app's code.
final class ShareViewController: UIViewController {
    private let appGroup = "group.com.pompeii.nero"
    private let serverKey = "nero.serverURL"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        Task { await run() }
    }

    private func run() async {
        guard let base = serverURL() else {
            await finish()
            return
        }
        let text = (await extractText()) ?? ""
        let images = await extractImages()
        if !text.isEmpty || !images.isEmpty {
            await send(text: text, images: images, base: base)
        }
        await finish()
    }

    private func finish() async {
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

    private func extractImages() async -> [Data] {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else { return [] }
        var out: [Data] = []
        for item in items {
            for provider in item.attachments ?? [] {
                guard provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) else {
                    continue
                }
                if let d = await loadImageData(provider) { out.append(d) }
            }
        }
        return out
    }

    /// Normalize any shared image (HEIC/PNG/URL/UIImage) to JPEG bytes.
    private func loadImageData(_ p: NSItemProvider) async -> Data? {
        if p.canLoadObject(ofClass: UIImage.self) {
            let img: UIImage? = await withCheckedContinuation { cont in
                p.loadObject(ofClass: UIImage.self) { obj, _ in cont.resume(returning: obj as? UIImage) }
            }
            if let data = img?.jpegData(compressionQuality: 0.85) { return data }
        }
        if let item = await load(p, UTType.image.identifier) {
            if let url = item as? URL, let d = try? Data(contentsOf: url) { return d }
            if let d = item as? Data { return d }
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

    private func send(text: String, images: [Data], base: URL) async {
        var body: [String: Any] = ["errand": true]
        body["text"] = text
        if !images.isEmpty {
            body["attachments"] = images.map {
                ["data": $0.base64EncodedString(), "mimeType": "image/jpeg", "name": "shared.jpg"]
            }
        }
        var req = URLRequest(url: base.appendingPathComponent("v1/nero"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        _ = try? await URLSession.shared.data(for: req)
    }
}
