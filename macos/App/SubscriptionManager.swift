import StoreKit
import AppKit

// MARK: - App Groups Constants

enum AppGroupKeys {
    static let suiteName = "group.me.shld.shieldmail"
    static let tier      = "sm_tier"
    static let jws       = "sm_jws"
    static let expires   = "sm_expires"
    static let productId = "sm_product_id"
}

// MARK: - SubscriptionManager (macOS)

@MainActor
final class SubscriptionManager: ObservableObject {

    static let productId = "me.shld.shieldmail.pro.monthly"

    @Published var tier: String = "free"
    @Published var isLoading = false
    @Published var errorMessage: String?

    private var product: Product?
    private var updateListenerTask: Task<Void, Never>?

    deinit {
        updateListenerTask?.cancel()
    }

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
                errorMessage = "구매 승인 대기 중입니다."
            case .userCancelled:
                break
            @unknown default:
                errorMessage = "알 수 없는 결제 결과입니다."
            }
        } catch {
            errorMessage = "결제 중 오류가 발생했습니다: \(error.localizedDescription)"
        }
    }

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

    func checkEntitlements() async {
        var foundActive = false
        for await result in Transaction.currentEntitlements {
            guard let transaction = try? checkVerified(result) else { continue }
            if transaction.productID == Self.productId, transaction.revocationDate == nil {
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

    func showManageSubscriptions() {
        if let url = URL(string: "https://apps.apple.com/account/subscriptions") {
            NSWorkspace.shared.open(url)
        }
    }

    var displayPrice: String {
        product?.displayPrice ?? "$0.99"
    }

    // MARK: - Private

    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let value): return value
        case .unverified(_, let error): throw error
        }
    }

    private func handleTransaction(_ transaction: Transaction) async {
        if transaction.revocationDate != nil {
            tier = "free"
            clearAppGroup()
            return
        }
        tier = "pro"
        persistToAppGroup(
            jws: transaction.jsonRepresentation.base64EncodedString(),
            productId: transaction.productID,
            expiresDate: transaction.expirationDate
        )
    }

    @MainActor
    private func handleVerifiedUpdate(_ transaction: Transaction) async {
        if transaction.productID == Self.productId {
            if transaction.revocationDate != nil {
                tier = "free"
                clearAppGroup()
            } else {
                tier = "pro"
                persistToAppGroup(
                    jws: transaction.jsonRepresentation.base64EncodedString(),
                    productId: transaction.productID,
                    expiresDate: transaction.expirationDate
                )
            }
        }
    }

    private func persistToAppGroup(jws: String?, productId: String?, expiresDate: Date?) {
        guard let defaults = UserDefaults(suiteName: AppGroupKeys.suiteName) else {
            errorMessage = "구독 상태 저장에 실패했습니다."
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
