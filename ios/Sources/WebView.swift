import SwiftUI
import WebKit

struct WebView: UIViewRepresentable {
    let url: URL
    @Binding var reloadTrigger: Int
    @Binding var navigateURL: URL?

    func makeCoordinator() -> Coordinator {
        Coordinator(self)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.uiDelegate = context.coordinator
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.bounces = true

        let refresh = UIRefreshControl()
        refresh.addTarget(
            context.coordinator,
            action: #selector(Coordinator.handleRefresh(_:)),
            for: .valueChanged
        )
        webView.scrollView.refreshControl = refresh

        webView.load(URLRequest(url: url))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if reloadTrigger != context.coordinator.lastReloadTrigger {
            context.coordinator.lastReloadTrigger = reloadTrigger
            webView.reload()
        }

        if let target = navigateURL, target != context.coordinator.lastNavigatedURL {
            context.coordinator.lastNavigatedURL = target
            webView.load(URLRequest(url: target))
        }
    }

    final class Coordinator: NSObject, WKUIDelegate, WKNavigationDelegate {
        let parent: WebView
        var lastReloadTrigger: Int = 0
        var lastNavigatedURL: URL?

        init(_ parent: WebView) {
            self.parent = parent
        }

        @objc func handleRefresh(_ sender: UIRefreshControl) {
            guard let webView = sender.superview?.superview as? WKWebView else {
                sender.endRefreshing()
                return
            }
            webView.reload()
        }

        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            decisionHandler(.grant)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(
            _ webView: WKWebView,
            didFail navigation: WKNavigation!,
            withError error: Error
        ) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(
            _ webView: WKWebView,
            didFailProvisionalNavigation navigation: WKNavigation!,
            withError error: Error
        ) {
            webView.scrollView.refreshControl?.endRefreshing()
        }
    }
}
