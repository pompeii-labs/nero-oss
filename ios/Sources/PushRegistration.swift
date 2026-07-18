import Foundation
import UIKit

enum PushRegistration {
    static let serverURLKey = "nero.serverURL"
    static let bundleID = "com.pompeii.nero"

    static func reregister() {
        DispatchQueue.main.async {
            UIApplication.shared.registerForRemoteNotifications()
        }
    }

    static func register(token: String) {
        guard let base = UserDefaults.standard.string(forKey: serverURLKey),
              let url = registerURL(from: base) else {
            print("[Nero] No server URL stored, skipping push registration")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "content-type")

        let body: [String: String] = [
            "token": token,
            "platform": "ios",
            "bundle_id": bundleID
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            print("[Nero] Failed to encode push registration body: \(error.localizedDescription)")
            return
        }

        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error {
                print("[Nero] Push registration failed: \(error.localizedDescription)")
                return
            }
            if let http = response as? HTTPURLResponse {
                print("[Nero] Push registration status: \(http.statusCode)")
            }
        }.resume()
    }

    private static func registerURL(from base: String) -> URL? {
        let trimmed = base.trimmingCharacters(in: .whitespacesAndNewlines)
        guard var components = URLComponents(string: trimmed) else { return nil }
        var path = components.path
        if path.hasSuffix("/") { path.removeLast() }
        components.path = path + "/v1/push/register"
        return components.url
    }
}
