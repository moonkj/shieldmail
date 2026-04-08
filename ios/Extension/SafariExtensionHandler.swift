import SafariServices
import UIKit

/// SFSafariExtensionHandler — bridge between content scripts and iOS native layer.
///
/// Message routing:
///   "haptic"        → trigger UIFeedbackGenerator
///   "storeToken"    → write pollToken to Keychain
///   "getToken"      → read pollToken from Keychain, reply via page script
///   "storeAliases"  → persist recent aliases to Keychain (for long-press menu)
///   "getAliases"    → read recent aliases from Keychain
class SafariExtensionHandler: SFSafariExtensionHandler {

    private let keychain = KeychainBridge()
    private let haptic   = HapticBridge()

    // MARK: - Message Dispatch

    override func messageReceived(
        withName messageName: String,
        from page: SFSafariPage,
        userInfo: [String: Any]?
    ) {
        switch messageName {
        case "haptic":
            haptic.trigger(style: userInfo?["style"] as? String ?? "medium")

        case "storeToken":
            guard let aliasId = userInfo?["aliasId"] as? String,
                  let token   = userInfo?["token"]   as? String else { return }
            keychain.storeToken(token, for: aliasId)

        case "getToken":
            guard let aliasId = userInfo?["aliasId"] as? String else { return }
            let token = keychain.loadToken(for: aliasId)
            page.dispatchMessageToScript(
                withName: "tokenResult",
                userInfo: ["aliasId": aliasId, "token": token as Any]
            )

        case "storeAliases":
            // JS sends { aliases: [{ aliasId, address, label? }] } (array of one).
            // Use appendRecentAlias to prepend the newest entry and keep max 3.
            guard let aliases = userInfo?["aliases"] as? [[String: Any]],
                  let first   = aliases.first else { return }
            keychain.appendRecentAlias(first)

        case "getAliases":
            let aliases = keychain.loadRecentAliases()
            page.dispatchMessageToScript(
                withName: "aliasesResult",
                userInfo: ["aliases": aliases]
            )

        default:
            break
        }
    }

    // MARK: - Context Menu (Long-press icon in toolbar)

    override func contextMenuItemSelected(
        withCommand command: String,
        in page: SFSafariPage,
        userInfo: [String: Any]? = nil
    ) {
        if command == "fill-field" {
            page.dispatchMessageToScript(
                withName: "FORCE_INJECT",
                userInfo: [:]
            )
        }
    }

    override func validateContextMenuItem(
        withCommand command: String,
        in page: SFSafariPage,
        userInfo: [String: Any]? = nil,
        validationHandler: @escaping (Bool, String?) -> Void
    ) {
        validationHandler(true, nil)
    }

    // MARK: - Toolbar item badge (future: unread OTP count)

    override func toolbarItemClicked(in window: SFSafariWindow) {
        // The popup HTML is shown automatically by Safari when the toolbar
        // button is tapped; no action needed here.
    }

    // MARK: - Page load lifecycle (clear stale state)

    override func page(
        _ page: SFSafariPage,
        willNavigateTo url: URL?
    ) {
        // Nothing to do — content script handles page lifecycle.
    }
}
