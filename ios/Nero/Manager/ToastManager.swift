import SwiftUI

struct Toast: Identifiable, Equatable {
    let id = UUID()
    let message: String
    let type: ToastType
    let duration: TimeInterval

    enum ToastType {
        case success
        case error
        case info

        var icon: String {
            switch self {
            case .success: return "checkmark.circle.fill"
            case .error: return "xmark.circle.fill"
            case .info: return "info.circle.fill"
            }
        }

        var color: Color {
            switch self {
            case .success: return .nSuccess
            case .error: return .nError
            case .info: return .neroBlue
            }
        }
    }
}

@MainActor
class ToastManager: ObservableObject {
    static let shared = ToastManager()

    @Published var toasts: [Toast] = []

    private init() {}

    func show(_ message: String, type: Toast.ToastType = .info, duration: TimeInterval = 3.0) {
        let toast = Toast(message: message, type: type, duration: duration)
        toasts.append(toast)

        Task {
            try? await Task.sleep(nanoseconds: UInt64(duration * 1_000_000_000))
            withAnimation {
                toasts.removeAll { $0.id == toast.id }
            }
        }
    }

    func success(_ message: String) {
        show(message, type: .success)
    }

    func error(_ message: String) {
        show(message, type: .error, duration: 4.0)
    }

    func info(_ message: String) {
        show(message, type: .info)
    }
}
