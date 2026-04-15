import SafariServices
import os.log

/// Safari Web Extension native message handler for macOS.
/// Handles subscription state queries and purchase requests from the extension JS.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private static let suiteName = "group.me.shld.shieldmail"

    func beginRequest(with context: NSExtensionContext) {
        let message = extractMessage(from: context)
        let action = message?["action"] as? String

        let response: [String: Any]

        switch action {
        case "getSubscription":
            response = buildSubscriptionResponse()

        case "purchase":
            response = ["action": "openApp", "url": "shieldmail://subscribe"]

        default:
            response = ["error": "unknown_action"]
        }

        let responseItem = NSExtensionItem()
        responseItem.userInfo = [SFExtensionMessageKey: response]
        context.completeRequest(returningItems: [responseItem], completionHandler: nil)
    }

    private func buildSubscriptionResponse() -> [String: Any] {
        guard let defaults = UserDefaults(suiteName: Self.suiteName) else {
            return ["tier": "free", "jws": NSNull(), "expiresDate": NSNull()]
        }

        let tier = defaults.string(forKey: "sm_tier") ?? "free"
        let jws = defaults.string(forKey: "sm_jws")
        let expires = defaults.double(forKey: "sm_expires")

        var result: [String: Any] = ["tier": tier]
        result["jws"] = jws ?? NSNull()
        // Convert seconds to milliseconds for JS.
        result["expiresDate"] = expires > 0 ? expires * 1000 : NSNull()
        if let pid = defaults.string(forKey: "sm_product_id") {
            result["productId"] = pid
        }
        return result
    }

    private func extractMessage(from context: NSExtensionContext) -> [String: Any]? {
        guard let item = context.inputItems.first as? NSExtensionItem,
              let msg = item.userInfo?[SFExtensionMessageKey] as? [String: Any] else {
            return nil
        }
        return msg
    }
}
