import Foundation

/// Safari Web Extension native message handler for iOS.
///
/// Handles `browser.runtime.sendNativeMessage()` calls from the extension's
/// service worker / content scripts.
///
/// Supported actions:
///   - `getSubscription`: Returns the current subscription state from App Groups.
///
/// JS usage:
///   browser.runtime.sendNativeMessage(
///     "me.shld.shieldmail",
///     { action: "getSubscription" },
///     (response) => { console.log(response.tier); }
///   );
class SafariExtensionHandler: NSObject, NSExtensionRequestHandling {

    private static let suiteName = "group.me.shld.shieldmail"

    func beginRequest(with context: NSExtensionContext) {
        // Extract the incoming message from the extension context.
        let request = extractMessage(from: context)
        let action = request?["action"] as? String

        let response: [String: Any]

        switch action {
        case "getSubscription":
            response = buildSubscriptionResponse()

        case "purchase":
            // Open the container app for StoreKit purchase.
            // Extension cannot directly trigger StoreKit — redirect to the app.
            if let url = URL(string: "shieldmail://subscribe") {
                // extensionContext.open(url) is only available on iOS 16+
                // Safari extensions can't open URLs directly; return the URL
                // for JS to handle via window.open().
                response = ["action": "openApp", "url": url.absoluteString]
            } else {
                response = ["action": "openApp", "url": "shieldmail://subscribe"]
            }

        default:
            response = ["error": "unknown_action"]
        }

        // Build the NSExtensionItem response.
        let responseItem = NSExtensionItem()
        responseItem.userInfo = [SFExtensionMessageKey: response]

        context.completeRequest(returningItems: [responseItem], completionHandler: nil)
    }

    // MARK: - Subscription Response

    /// Reads subscription data from App Groups UserDefaults and returns
    /// a dictionary suitable for JSON serialization back to JavaScript.
    private func buildSubscriptionResponse() -> [String: Any] {
        guard let defaults = UserDefaults(suiteName: Self.suiteName) else {
            return ["tier": "free", "jws": NSNull(), "expiresDate": NSNull()]
        }

        let tier = defaults.string(forKey: "sm_tier") ?? "free"
        let jws = defaults.string(forKey: "sm_jws")
        let expires = defaults.double(forKey: "sm_expires")  // 0 if not set
        let productId = defaults.string(forKey: "sm_product_id")

        var result: [String: Any] = ["tier": tier]

        if let jws {
            result["jws"] = jws
        } else {
            result["jws"] = NSNull()
        }

        if expires > 0 {
            // Convert seconds to milliseconds for JavaScript consistency.
            result["expiresDate"] = expires * 1000
        } else {
            result["expiresDate"] = NSNull()
        }

        if let productId {
            result["productId"] = productId
        }

        return result
    }

    // MARK: - Message Extraction

    /// Extracts the message dictionary from the NSExtensionContext.
    /// Safari Web Extensions on iOS send messages as the `userInfo`
    /// of the first input item, keyed by `SFExtensionMessageKey`.
    private func extractMessage(from context: NSExtensionContext) -> [String: Any]? {
        guard let item = context.inputItems.first as? NSExtensionItem,
              let message = item.userInfo?[SFExtensionMessageKey] as? [String: Any]
        else { return nil }
        return message
    }
}

/// The key used by Safari Web Extensions for native messaging.
/// This matches `SFSafariExtensionHandler`'s message key on macOS.
/// On iOS, it is the string `"message"`.
private let SFExtensionMessageKey = "message"
