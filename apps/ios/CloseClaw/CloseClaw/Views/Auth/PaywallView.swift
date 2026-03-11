import SwiftUI
import StoreKit

struct PaywallView: View {
    @ObservedObject var viewModel: AppViewModel
    @ObservedObject var purchaseService: PurchaseService
    
    @State private var isPurchasing = false
    @State private var purchaseError: String?

    var body: some View {
        ZStack {
            NebulaBackground().ignoresSafeArea()
            
            VStack(spacing: 32) {
                // Header
                VStack(spacing: 12) {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 48))
                        .premiumTextGradient()
                        .shadow(color: CloseClawTheme.accentGlow, radius: 15)
                    
                    VStack(spacing: 8) {
                        Text("Unlock CloseClaw")
                            .font(CloseClawTheme.Typography.title())
                            .foregroundStyle(CloseClawTheme.textPrimary)
                        
                        Text("Subscribe to get your private AI environment and start building.")
                            .font(CloseClawTheme.Typography.body())
                            .foregroundStyle(CloseClawTheme.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.top, 40)
                .staggeredReveal(index: 0)

                // Benefits
                VStack(alignment: .leading, spacing: 16) {
                    BenefitRow(icon: "cpu", text: "Dedicated Private Gateway")
                    BenefitRow(icon: "lock.shield", text: "End-to-End Encrypted Instances")
                    BenefitRow(icon: "sparkles", text: "Unlimited Custom AI Agents")
                }
                .padding(24)
                .closeClawGlassCard()
                .staggeredReveal(index: 1)

                Spacer()

                // Actions
                VStack(spacing: 12) {
                    if let subscription = purchaseService.products.first(where: { $0.id == "closeclaw.monthly" }) {
                        CloseClawButton(
                            title: "Subscribe for \(subscription.displayPrice)/mo",
                            isLoading: isPurchasing,
                            action: { subscribe(subscription) }
                        )
                    } else {
                        ProgressView().tint(CloseClawTheme.accentPrimary)
                    }
                    
                    CloseClawButton(
                        title: "Restore Purchases",
                        variant: .ghost,
                        action: { restore() }
                    )
                    
                    CloseClawButton(
                        title: "Sign Out",
                        variant: .ghost,
                        action: { Task { await viewModel.signOut() } }
                    )
                }
                .padding(.bottom, 20)
                .staggeredReveal(index: 2)
            }
            .padding(24)
            
            if isPurchasing {
                Color.black.opacity(0.4).ignoresSafeArea()
                ProgressView("Activating...")
                    .padding()
                    .background(.ultraThinMaterial)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .alert("Purchase Failed", isPresented: Binding(
            get: { purchaseError != nil },
            set: { if !$0 { purchaseError = nil } }
        )) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(purchaseError ?? "Unknown error")
        }
    }

    private func subscribe(_ product: Product) {
        isPurchasing = true
        Task {
            defer { isPurchasing = false }
            do {
                let result = try await purchaseService.purchase(product)
                await viewModel.handlePurchaseSuccess(result: result)
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
                await viewModel.handlePurchaseSuccess(result: nil)
            } catch {
                purchaseError = error.localizedDescription
            }
        }
    }
}

private struct BenefitRow: View {
    let icon: String
    let text: String
    
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .bold))
                .foregroundStyle(CloseClawTheme.accentSecondary)
                .frame(width: 24)
            
            Text(text)
                .font(CloseClawTheme.Typography.body())
                .foregroundStyle(CloseClawTheme.textPrimary)
        }
    }
}
