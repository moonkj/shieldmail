import StoreKit
import UIKit

// MARK: - App Groups Constants

enum AppGroupKeys {
    static let suiteName = "group.me.shld.shieldmail"
    static let tier      = "sm_tier"
    static let jws       = "sm_jws"
    static let expires   = "sm_expires"
    static let productId = "sm_product_id"
}

// MARK: - SubscriptionManager

@MainActor
final class SubscriptionManager: ObservableObject {

    static let productId = "me.shld.shieldmail.pro.monthly"  // $0.99/mo

    // MARK: Published state

    @Published var tier: String = "free"         // "free" | "pro"
    @Published var isLoading = false
    @Published var errorMessage: String?

    // MARK: Private

    private var product: Product?
    private var updateListenerTask: Task<Void, Never>?

    // MARK: Lifecycle

    deinit {
        updateListenerTask?.cancel()
    }

    // MARK: - Public API

    /// Load products from the App Store.
    func loadProducts() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let products = try await Product.products(for: [Self.productId])
            product = products.first
        } catch {
            errorMessage = "상품 정보를 불러올 수 없습니다: \(error.localizedDescription)"
        }
    }

    /// Purchase the Pro subscription.
    func purchase() async throws {
        guard let product else {
            errorMessage = "상품 정보가 없습니다. 잠시 후 다시 시도해주세요."
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            let result = try await product.purchase()

            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                await handleTransaction(transaction)
                await transaction.finish()

            case .pending:
                // Ask-to-Buy or Strong Customer Authentication pending
                errorMessage = "구매 승인 대기 중입니다. 승인 후 자동으로 반영됩니다."

            case .userCancelled:
                // User tapped Cancel — no error needed
                break

            @unknown default:
                errorMessage = "알 수 없는 결제 결과입니다."
            }
        } catch {
            errorMessage = "결제 중 오류가 발생했습니다: \(error.localizedDescription)"
        }
    }

    /// Restore previous purchases.
    func restore() async {
        isLoading = true
        defer { isLoading = false }

        do {
            try await AppStore.sync()
            await checkEntitlements()
        } catch {
            errorMessage = "구매 복원에 실패했습니다: \(error.localizedDescription)"
        }
    }

    /// Check current entitlements (active subscriptions).
    func checkEntitlements() async {
        var foundActive = false

        for await result in Transaction.currentEntitlements {
            guard let transaction = try? checkVerified(result) else { continue }

            if transaction.productID == Self.productId,
               transaction.revocationDate == nil {
                await handleTransaction(transaction)
                foundActive = true
                break
            }
        }

        if !foundActive {
            tier = "free"
            clearAppGroup()
        }
    }

    /// Listen for real-time Transaction updates (renewals, revocations, refunds).
    func listenForUpdates() {
        updateListenerTask?.cancel()
        updateListenerTask = Task(priority: .background) { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                if let transaction = try? await self.checkVerified(result) {
                    await self.handleVerifiedUpdate(transaction)
                    await transaction.finish()
                }
            }
        }
    }

    /// Present the App Store subscription management sheet.
    func showManageSubscriptions() async {
        guard let windowScene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first
        else { return }

        do {
            try await AppStore.showManageSubscriptions(in: windowScene)
        } catch {
            errorMessage = "구독 관리 화면을 열 수 없습니다."
        }
    }

    // MARK: - Formatted Price

    var displayPrice: String {
        product?.displayPrice ?? "$0.99"
    }

    // MARK: - Private Helpers

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let value):
            return value
        case .unverified(_, let error):
            throw error
        }
    }

    private func handleTransaction(_ transaction: Transaction) async {
        if transaction.revocationDate != nil {
            // Revoked / refunded
            tier = "free"
            clearAppGroup()
            return
        }

        tier = "pro"
        persistToAppGroup(
            jws: String(transaction.id),
            productId: transaction.productID,
            expiresDate: transaction.expirationDate
        )
    }

    @MainActor
    private func handleVerifiedUpdate(_ transaction: Transaction) async {
        if transaction.productID == Self.productId {
            if transaction.revocationDate != nil {
                // Revoked or refunded
                tier = "free"
                clearAppGroup()
            } else {
                tier = "pro"
                persistToAppGroup(
                    jws: String(transaction.id),
                    productId: transaction.productID,
                    expiresDate: transaction.expirationDate
                )
            }
        }
    }

    // MARK: - App Groups Persistence

    private func persistToAppGroup(jws: String?, productId: String?, expiresDate: Date?) {
        guard let defaults = UserDefaults(suiteName: AppGroupKeys.suiteName) else {
            errorMessage = "구독 상태 저장에 실패했습니다. 앱을 재시작해주세요."
            return
        }
        defaults.set("pro", forKey: AppGroupKeys.tier)
        defaults.set(jws, forKey: AppGroupKeys.jws)
        defaults.set(productId, forKey: AppGroupKeys.productId)
        if let expiresDate {
            defaults.set(expiresDate.timeIntervalSince1970, forKey: AppGroupKeys.expires)
        } else {
            defaults.removeObject(forKey: AppGroupKeys.expires)
        }
        defaults.synchronize()
    }

    private func clearAppGroup() {
        guard let defaults = UserDefaults(suiteName: AppGroupKeys.suiteName) else { return }
        defaults.set("free", forKey: AppGroupKeys.tier)
        defaults.removeObject(forKey: AppGroupKeys.jws)
        defaults.removeObject(forKey: AppGroupKeys.productId)
        defaults.removeObject(forKey: AppGroupKeys.expires)
        defaults.synchronize()
    }
}
