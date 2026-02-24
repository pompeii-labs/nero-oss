import Foundation
import SwiftUI

@MainActor
class PresenceManager: ObservableObject {
    static let shared = PresenceManager()

    @Published var neroDisplay: String = "main"

    var deviceName: String {
        UIDevice.current.name
    }

    private var deviceId: String {
        let key = "nero_presence_device_id"
        if let existing = UserDefaults.standard.string(forKey: key) {
            return existing
        }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: key)
        return id
    }

    private var baseURL: String {
        NeroManager.shared.serverURL
    }

    private var licenseKey: String {
        NeroManager.shared.licenseKey
    }

    private var sseTask: Task<Void, Never>?
    private var reconnectDelay: TimeInterval = 5

    var neroIsHere: Bool {
        neroDisplay == deviceName
    }

    private init() {}

    func connect() {
        disconnect()
        sseTask = Task { [weak self] in
            await self?.runSSE()
        }
    }

    func disconnect() {
        sseTask?.cancel()
        sseTask = nil
    }

    func fetchPresence() async {
        guard !baseURL.isEmpty else { return }

        let urlString = "\(baseURL)/api/presence"
        guard let url = URL(string: urlString) else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        if !licenseKey.isEmpty {
            request.setValue(licenseKey, forHTTPHeaderField: "x-license-key")
        }

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let display = json["display"] as? String {
                self.neroDisplay = display
            }
        } catch {}
    }

    func nudge() async {
        guard !baseURL.isEmpty else { return }

        let urlString = "\(baseURL)/api/presence"
        guard let url = URL(string: urlString) else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !licenseKey.isEmpty {
            request.setValue(licenseKey, forHTTPHeaderField: "x-license-key")
        }

        let body: [String: String] = ["display": deviceName]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let display = json["display"] as? String {
                self.neroDisplay = display
            }
        } catch {}
    }

    private func runSSE() async {
        guard !baseURL.isEmpty else { return }

        let device = deviceId
        let name = deviceName.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? deviceName
        let urlString = "\(baseURL)/api/interfaces/events?device=\(device)&name=\(name)"
        guard let url = URL(string: urlString) else { return }

        var request = URLRequest(url: url)
        request.timeoutInterval = .infinity
        if !licenseKey.isEmpty {
            request.setValue(licenseKey, forHTTPHeaderField: "x-license-key")
        }

        do {
            let (stream, _) = try await URLSession.shared.bytes(for: request)

            for try await line in stream.lines {
                if Task.isCancelled { return }

                guard line.hasPrefix("data: ") else { continue }
                let payload = String(line.dropFirst(6))
                guard payload != "{}" else { continue }

                guard let data = payload.data(using: .utf8),
                      let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      let type = json["type"] as? String else {
                    continue
                }

                if type == "presence", let display = json["display"] as? String {
                    self.neroDisplay = display

                    if display == deviceName {
                        if VoiceManager.shared.status == .idle {
                            await VoiceManager.shared.connect()
                        }
                    } else {
                        if VoiceManager.shared.status != .idle {
                            VoiceManager.shared.migrateAway()
                        }
                    }
                }

                if type == "voice_migrate", let targetDevice = json["targetDevice"] as? String {
                    if targetDevice == deviceName {
                        if VoiceManager.shared.status == .idle {
                            await VoiceManager.shared.connect()
                        }
                    } else if VoiceManager.shared.status != .idle {
                        VoiceManager.shared.migrateAway()
                    }
                }
            }
        } catch {
            if !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(reconnectDelay * 1_000_000_000))
                if !Task.isCancelled {
                    await runSSE()
                }
            }
        }
    }
}
