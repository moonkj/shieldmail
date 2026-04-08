import SafariServices
import os.log

/// Safari Web Extension native message handler for macOS.
///
/// On macOS, SFSafariExtensionHandler is supported but for MV3 Safari Web
/// Extensions the modern path is `SFSafariExtensionHandling` via
/// `NSExtensionRequestHandling` (same shape iOS uses). The MVP doesn't need
/// any native messaging — all persistence is in browser.storage.local.
class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        // No native messages handled in MVP.
        context.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
