import UIKit
import SwiftUI

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?
    private let subscriptionManager = SubscriptionManager()

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = UIHostingController(rootView: ContentView())
        self.window = window
        window.makeKeyAndVisible()

        // Handle URL if app was launched via shieldmail:// scheme.
        if let url = connectionOptions.urlContexts.first?.url {
            handleURL(url)
        }
    }

    // Handle shieldmail:// URL scheme (e.g. from Safari Extension "subscribe" button).
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard let url = URLContexts.first?.url else { return }
        handleURL(url)
    }

    private func handleURL(_ url: URL) {
        guard url.scheme == "shieldmail" else { return }
        if url.host == "subscribe" {
            // Trigger purchase via SubscriptionManager.
            Task {
                await subscriptionManager.loadProducts()
                try? await subscriptionManager.purchase()
            }
        }
    }
}
