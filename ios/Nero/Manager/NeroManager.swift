import SwiftUI

@MainActor
class NeroManager: ObservableObject {
    static let shared = NeroManager()

    @AppStorage("nero_server_url") var serverURL: String = ""
    @AppStorage("nero_license_key") var licenseKey: String = ""
    @AppStorage("nero_connection_mode") var connectionMode: ConnectionMode = .local

    @Published var isConnected = false
    @Published var serverInfo: ServerInfo?
    @Published var apiInfo: APIInfo?
    @Published var isChecking = false

    enum ConnectionMode: String {
        case local
        case tunnel
    }

    private init() {}

    func checkConnection() async -> Bool {
        guard !serverURL.isEmpty else {
            isConnected = false
            return false
        }

        isChecking = true
        defer { isChecking = false }

        do {
            let url = URL(string: "\(serverURL)/health")!
            var request = URLRequest(url: url)
            request.timeoutInterval = 5

            if !licenseKey.isEmpty {
                request.setValue(licenseKey, forHTTPHeaderField: "x-license-key")
            }

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                isConnected = false
                return false
            }

            let info = try JSONDecoder().decode(ServerInfo.self, from: data)
            serverInfo = info
            isConnected = true

            await fetchAPIInfo()

            return true
        } catch {
            isConnected = false
            serverInfo = nil
            return false
        }
    }

    private func fetchAPIInfo() async {
        guard !serverURL.isEmpty else { return }

        do {
            let url = URL(string: "\(serverURL)/api")!
            var request = URLRequest(url: url)

            if !licenseKey.isEmpty {
                request.setValue(licenseKey, forHTTPHeaderField: "x-license-key")
            }

            let (data, _) = try await URLSession.shared.data(for: request)
            apiInfo = try JSONDecoder().decode(APIInfo.self, from: data)
        } catch {
            apiInfo = nil
        }
    }

    func verifyLicenseKey(_ key: String) async -> LicenseVerifyResponse? {
        let apiUrl = "https://api.magmadeploy.com/v1/license/verify"

        do {
            let url = URL(string: apiUrl)!
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue(key, forHTTPHeaderField: "x-license-key")
            request.timeoutInterval = 10

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                return nil
            }

            return try JSONDecoder().decode(LicenseVerifyResponse.self, from: data)
        } catch {
            return nil
        }
    }

    func configure(serverURL: String, licenseKey: String, mode: ConnectionMode) {
        self.serverURL = serverURL
        self.licenseKey = licenseKey
        self.connectionMode = mode
    }

    func disconnect() {
        isConnected = false
        serverInfo = nil
        apiInfo = nil
        serverURL = ""
        licenseKey = ""
    }
}
