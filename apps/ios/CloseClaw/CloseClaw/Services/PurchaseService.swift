import Foundation
import StoreKit

enum PurchaseError: LocalizedError {
    case productNotFound
    case purchaseFailed
    case pendingApproval
    case cancelled
    case unverified
    
    var errorDescription: String? {
        switch self {
        case .productNotFound: return "The selected product is not available."
        case .purchaseFailed: return "The transaction could not be completed."
        case .pendingApproval: return "Purchase is pending approval (Ask to Buy)."
        case .cancelled: return "Purchase was cancelled."
        case .unverified: return "The transaction could not be verified by Apple."
        }
    }
}

@MainActor
final class PurchaseService: ObservableObject {
    @Published private(set) var products: [Product] = []
    @Published private(set) var purchasedProductIDs = Set<String>()
    
    private var transactionListener: Task<Void, Never>?
    
    // MARK: - Update these with your real App Store IDs
    private let platformPlanID = "closeclaw.monthly"
    private let topUpPackID = "closeclaw.five"
    
    init() {
        transactionListener = listenForTransactions()
        Task {
            await fetchProducts()
            await updatePurchasedStatus()
        }
    }
    
    deinit {
        transactionListener?.cancel()
    }
    
    func fetchProducts() async {
        do {
            let fetchedProducts = try await Product.products(for: [platformPlanID, topUpPackID])
            self.products = fetchedProducts
            print("[PurchaseService] Fetched \(fetchedProducts.count) products from App Store.")
        } catch {
            print("[PurchaseService] Failed to fetch products: \(error)")
        }
    }
    
    func purchase(_ product: Product) async throws -> VerificationResult<StoreKit.Transaction> {
        let result = try await product.purchase()
        
        switch result {
        case let .success(verification):
            if case let .verified(transaction) = verification {
                await transaction.finish()
            }
            await updatePurchasedStatus()
            return verification
            
        case .pending:
            throw PurchaseError.pendingApproval
            
        case .userCancelled:
            throw PurchaseError.cancelled
            
        @unknown default:
            throw PurchaseError.purchaseFailed
        }
    }
    
    func restorePurchases() async throws {
        try await AppStore.sync()
        await updatePurchasedStatus()
    }
    
    private func updatePurchasedStatus() async {
        for await result in StoreKit.Transaction.currentEntitlements {
            if case let .verified(transaction) = result {
                if transaction.revocationDate == nil {
                    purchasedProductIDs.insert(transaction.productID)
                } else {
                    purchasedProductIDs.remove(transaction.productID)
                }
            }
        }
    }
    
    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached {
            for await result in StoreKit.Transaction.updates {
                if case let .verified(transaction) = result {
                    await transaction.finish()
                    await self.updatePurchasedStatus()
                }
            }
        }
    }
    
    func getProduct(for id: String) -> Product? {
        products.first { $0.id == id }
    }
}
