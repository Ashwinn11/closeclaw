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
            
            GeometryReader { geometry in
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 40) {
                        Spacer(minLength: 20)
                        
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
        
                        // Actions
                        VStack(spacing: 16) {
                            if let subscription = purchaseService.products.first(where: { $0.id == "closeclaw.monthly" }) {
                                CloseClawButton(
                                    title: "Subscribe for \(subscription.displayPrice)/mo",
                                    isLoading: isPurchasing,
                                    action: { subscribe(subscription) }
                                )
                            } else {
                                ProgressView().tint(CloseClawTheme.accentPrimary)
                                    .frame(height: 54)
                            }
                            
                            CloseClawButton(
                                title: "Restore Purchases",
                                variant: .secondary,
                                action: { restore() }
                            )
                            
                            CloseClawButton(
                                title: "Sign Out",
                                variant: .ghost,
                                action: { Task { await viewModel.signOut() } }
                            )
                            
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
                        }
                        .staggeredReveal(index: 2)
                        
                        Spacer(minLength: 20)
                    }
                    .padding(24)
                    .frame(minHeight: geometry.size.height)
                }
            }
            
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
                
                if let result = await purchaseService.getLatestValidTransaction(for: "closeclaw.monthly") {
                    await viewModel.handlePurchaseSuccess(result: result)
                } else {
                    purchaseError = "No active subscription found to restore."
                }
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
