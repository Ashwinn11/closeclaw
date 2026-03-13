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
                            title: "API Credit Balance",
                            value: String(format: "$%.2f", credits.api_credits),
                            subtitle: credits.plan == "platform" ? "Private Environment: Active" : "Private Environment: Required"
                        )
                        .staggeredReveal(index: 0)
                    }

                    // Purchase Options
                    VStack(alignment: .leading, spacing: 16) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Add Funds")
                                .font(CloseClawTheme.Typography.subtitle())
                                .foregroundStyle(CloseClawTheme.textSecondary)
                            
                            if viewModel.credits?.plan != "platform" {
                                Text("Note: Consumable top-ups require an active Platform Subscription to provision your environment.")
                                    .font(.system(size: 11))
                                    .foregroundStyle(CloseClawTheme.accentPrimary.opacity(0.8))
                            }
                        }
                        
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
                    
                    // ── Required by Apple Guideline 3.1.2(a) ──────────────────
                    // Apps with auto-renewable subscriptions MUST provide a link
                    // to Apple's subscription management page.
                    VStack(spacing: 12) {
                        Button {
                            if let url = URL(string: "itms-apps://apps.apple.com/account/subscriptions") {
                                UIApplication.shared.open(url)
                            }
                        } label: {
                            VStack(spacing: 8) {
                                Text("Subscription Details")
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundStyle(CloseClawTheme.textSecondary)

                                Text("Payment will be charged to your Apple ID account at the confirmation of purchase. Subscription automatically renews unless it is canceled at least 24 hours before the end of the current period. Your account will be charged for renewal within 24 hours prior to the end of the current period. You can manage and cancel your subscriptions by going to your account settings on the App Store after purchase.")
                                    .font(.system(size: 10))
                                    .foregroundStyle(CloseClawTheme.textSecondary.opacity(0.6))
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 10)

                                HStack(spacing: 24) {
                                    Link("Terms of Service", destination: URL(string: "https://closeclaw.in/terms")!)
                                    Link("Privacy Policy", destination: URL(string: "https://closeclaw.in/privacy")!)
                                }
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(CloseClawTheme.textSecondary.opacity(0.7))
                                .padding(.top, 4)
                            }
                            .padding(.top, 8)
                            .padding(.vertical, 12)
                            .background(CloseClawTheme.surfaceBase)
                            .clipShape(RoundedRectangle(cornerRadius: CloseClawTheme.Radius.button, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: CloseClawTheme.Radius.button, style: .continuous)
                                    .stroke(CloseClawTheme.cardBorder, lineWidth: 1)
                            )
                        }
                        
                        Button {
                            restore()
                        } label: {
                            Text("Restore Purchases")
                                .font(CloseClawTheme.Typography.footnote())
                                .foregroundStyle(CloseClawTheme.accentPrimary)
                        }
                    }
                    .staggeredReveal(index: 2)
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
        .disabled(isLoading || (isPurchased && product.type == .autoRenewable) || (product.id == "fifty.closeclaw" && viewModel.credits?.plan != "platform"))
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
