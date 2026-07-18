import UIKit
import UserNotifications

extension Notification.Name {
    static let neroServerURLChanged = Notification.Name("nero.serverURLChanged")
    static let neroOpenURL = Notification.Name("nero.openURL")
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        requestNotificationAuthorization()
        return true
    }

    private func requestNotificationAuthorization() {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, error in
            if let error {
                print("[Nero] Notification authorization error: \(error.localizedDescription)")
            }
            guard granted else {
                print("[Nero] Notification authorization denied")
                return
            }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        print("[Nero] APNs device token: \(token)")
        PushRegistration.register(token: token)
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        print("[Nero] Failed to register for remote notifications: \(error.localizedDescription)")
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .badge, .sound])
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        if let urlString = (userInfo["url"] as? String) ?? (userInfo["URL"] as? String),
           let url = URL(string: urlString) {
            NotificationCenter.default.post(name: .neroOpenURL, object: url)
        }
        completionHandler()
    }
}
