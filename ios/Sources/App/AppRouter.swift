import Foundation

/// Where a tapped push should land. The AppDelegate sets it; the Field observes it.
enum PushRoute: Equatable {
    case chat
}

/// A tiny app-level router so a notification tap (handled in the AppDelegate) can drive
/// navigation in the SwiftUI Field.
final class AppRouter: ObservableObject {
    static let shared = AppRouter()
    @Published var route: PushRoute?
    private init() {}

    func open(_ r: PushRoute) {
        DispatchQueue.main.async { self.route = r }
    }
}
