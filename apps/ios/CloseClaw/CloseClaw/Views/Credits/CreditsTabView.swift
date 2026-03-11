import SwiftUI
import StoreKit

struct CreditsTabView: View {
    @ObservedObject var viewModel: CreditsViewModel
    @ObservedObject var purchaseService: PurchaseService
    let onRefresh: () async -> Void
    let onVerify: (VerificationResult<StoreKit.Transaction>?) async -> Void

    @State private var isPurchasing = false
    @State private var purchaseError: String?

    var body: some View {
        ZStack {
            NebulaBackground().ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 24) {
                    // Header Stats
                    if let credits = viewModel.credits {
                        CreditStatCard(
                            title: "Current Balance",
                            value: String(format: "$%.2f", credits.api_credits),
                            subtitle: "Plan: \(credits.plan.capitalized)"
                        )
                        .staggeredReveal(index: 0)
                    }

                    // Purchase Options
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Add Funds")
                            .font(CloseClawTheme.Typography.subtitle())
                            .foregroundStyle(CloseClawTheme.textSecondary)
                        
                        if purchaseService.products.isEmpty {
                            Text("Fetching products from App Store...")
                                .font(CloseClawTheme.Typography.footnote())
                                .foregroundStyle(CloseClawTheme.textSecondary)
                                .frame(maxWidth: .infinity, alignment: .center)
                                .padding()
                        } else {
                            ForEach(purchaseService.products) { product in
                                PurchaseRow(
                                    product: product,
                                    isPurchased: purchaseService.purchasedProductIDs.contains(product.id),
                                    isLoading: isPurchasing,
                                    action: { buy(product) },
                                    viewModel: viewModel
                                )
                            }
                        }
                    }
                    .staggeredReveal(index: 1)
                    
                    // Restore Button
                    Button {
                        restore()
                    } label: {
                        Text("Restore Purchases")
                            .font(CloseClawTheme.Typography.footnote())
                            .foregroundStyle(CloseClawTheme.accentPrimary)
                    }
                    .padding(.top, 10)
                }
                .padding(20)
            }
            
            if isPurchasing {
                Color.black.opacity(0.4).ignoresSafeArea()
                ProgressView("Syncing with Apple...")
                    .padding()
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .navigationTitle("Pricing & Credits")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Purchase Failed", isPresented: Binding(
            get: { purchaseError != nil },
            set: { if !$0 { purchaseError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(purchaseError ?? "Unknown error")
        }
    }

    private func buy(_ product: Product) {
        isPurchasing = true
        Task {
            defer { isPurchasing = false }
            do {
                let result = try await purchaseService.purchase(product)
                await onVerify(result)
            } catch {
                purchaseError = error.localizedDescription
            }
        }
    }

    private func restore() {
        isPurchasing = true
        Task {
            defer { isPurchasing = false }
            do {
                try await purchaseService.restorePurchases()
                await onRefresh()
            } catch {
                purchaseError = error.localizedDescription
            }
        }
    }
}

private struct PurchaseRow: View {
    let product: Product
    let isPurchased: Bool
    let isLoading: Bool
    let action: () -> Void
    let viewModel: CreditsViewModel

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(product.displayName)
                        .font(CloseClawTheme.Typography.body().weight(.semibold))
                        .foregroundStyle(CloseClawTheme.textPrimary)
                    Text(product.description)
                        .font(CloseClawTheme.Typography.footnote())
                        .foregroundStyle(CloseClawTheme.textSecondary)
                        .multilineTextAlignment(.leading)
                }
                
                Spacer()
                
                Text(isPurchased ? "Active" : product.displayPrice)
                    .font(CloseClawTheme.Typography.body().weight(.bold))
                    .foregroundStyle(isPurchased ? CloseClawTheme.accentSecondary : CloseClawTheme.accentPrimary)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(
                        Capsule()
                            .fill((isPurchased ? CloseClawTheme.accentSecondary : CloseClawTheme.accentPrimary).opacity(0.1))
                    )
            }
            .padding(16)
            .background(CloseClawTheme.surfaceBase)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(CloseClawTheme.cardBorder, lineWidth: 1)
            )
        }
        .disabled(isLoading || (isPurchased && product.type == .autoRenewable) || (product.id == "closeclaw.five" && viewModel.credits?.plan != "platform"))
    }
}


private struct CreditStatCard: View {
    let title: String
    let value: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(CloseClawTheme.textSecondary)
            Text(value)
                .font(.system(.title2, design: .rounded).weight(.semibold))
                .foregroundStyle(CloseClawTheme.textPrimary)
            Text(subtitle)
                .font(.footnote)
                .foregroundStyle(CloseClawTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .closeClawGlassCard()
    }
}
