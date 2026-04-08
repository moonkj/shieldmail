import Foundation
import Security

/// Keychain helper for the Safari Extension target.
///
/// Keys:
///   - Poll tokens:   `shieldmail.token.<aliasId>`
///   - Recent aliases: `shieldmail.recentAliases` (JSON array, max 3)
///
/// Both the app and extension targets share access via the
/// `me.shld.shieldmail` Keychain access group.
final class KeychainBridge {

    private let accessGroup = "me.shld.shieldmail"
    private let recentAliasesKey = "shieldmail.recentAliases"

    // MARK: - Poll Token

    func storeToken(_ token: String, for aliasId: String) {
        let key = tokenKey(aliasId)
        guard let data = token.data(using: .utf8) else { return }
        let query: [CFString: Any] = [
            kSecClass:           kSecClassGenericPassword,
            kSecAttrAccount:     key,
            kSecAttrAccessGroup: accessGroup,
            kSecAttrAccessible:  kSecAttrAccessibleAfterFirstUnlock,
            kSecValueData:       data,
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    func loadToken(for aliasId: String) -> String? {
        let key = tokenKey(aliasId)
        let query: [CFString: Any] = [
            kSecClass:           kSecClassGenericPassword,
            kSecAttrAccount:     key,
            kSecAttrAccessGroup: accessGroup,
            kSecReturnData:      true,
            kSecMatchLimit:      kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data,
              let token = String(data: data, encoding: .utf8)
        else { return nil }
        return token
    }

    func deleteToken(for aliasId: String) {
        let query: [CFString: Any] = [
            kSecClass:           kSecClassGenericPassword,
            kSecAttrAccount:     tokenKey(aliasId),
            kSecAttrAccessGroup: accessGroup,
        ]
        SecItemDelete(query as CFDictionary)
    }

    private func tokenKey(_ aliasId: String) -> String {
        "shieldmail.token.\(aliasId)"
    }

    // MARK: - Recent Aliases (max 3, for long-press context menu)

    /// Persist recent aliases as JSON. Keeps newest-first, max 3 entries.
    func storeRecentAliases(_ aliases: [[String: Any]]) {
        let trimmed = Array(aliases.prefix(3))
        guard let data = try? JSONSerialization.data(withJSONObject: trimmed) else { return }
        let query: [CFString: Any] = [
            kSecClass:           kSecClassGenericPassword,
            kSecAttrAccount:     recentAliasesKey,
            kSecAttrAccessGroup: accessGroup,
            kSecAttrAccessible:  kSecAttrAccessibleAfterFirstUnlock,
            kSecValueData:       data,
        ]
        SecItemDelete(query as CFDictionary)
        SecItemAdd(query as CFDictionary, nil)
    }

    func loadRecentAliases() -> [[String: Any]] {
        let query: [CFString: Any] = [
            kSecClass:           kSecClassGenericPassword,
            kSecAttrAccount:     recentAliasesKey,
            kSecAttrAccessGroup: accessGroup,
            kSecReturnData:      true,
            kSecMatchLimit:      kSecMatchLimitOne,
        ]
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data   = result as? Data,
              let parsed = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return parsed
    }

    /// Append a new alias and keep only the 3 most recent entries.
    func appendRecentAlias(_ alias: [String: Any]) {
        var current = loadRecentAliases()
        // Remove duplicate if already present (same aliasId).
        if let id = alias["aliasId"] as? String {
            current.removeAll { ($0["aliasId"] as? String) == id }
        }
        current.insert(alias, at: 0)
        storeRecentAliases(Array(current.prefix(3)))
    }
}
