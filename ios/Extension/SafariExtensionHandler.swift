import Foundation

/// Safari Web Extension native message handler for iOS.
///
/// On iOS, SFSafariExtensionHandler is macOS-only and cannot be used.
/// Safari Web Extensions on iOS use NSExtensionRequestHandling for any
/// browser.runtime.sendNativeMessage() calls from the service worker.
///
/// MVP strategy: all persistence (poll tokens, recent aliases) is handled
/// directly via browser.storage.local in the extension service worker —
/// no native messaging required. This class is a forward-compat skeleton
/// for future Keychain / App Group bridging (post-M5).
///
/// Future native messaging flow (post-MVP):
///   JS: browser.runtime.sendNativeMessage("me.shld.shieldmail", msg, reply)
///   Swift: beginRequest(with:) → decode msg → Keychain op → completeRequest
class SafariExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        // No native messages handled in MVP.
        // Persistence is entirely in browser.storage.local.
        context.completeRequest(returningItems: nil, completionHandler: nil)
    }
}
