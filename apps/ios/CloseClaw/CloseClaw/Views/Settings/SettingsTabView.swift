import SwiftUI
import StoreKit

struct SettingsTabView: View {
    @Environment(\.dismiss) private var dismiss
    let user: UserProfile?
    let gatewayStatusText: String
    @ObservedObject var creditsViewModel: CreditsViewModel
    @ObservedObject var purchaseService: PurchaseService
    var isLoadingDelete: Bool = false
    let onRestartGateway: () async -> Void
    let onRefreshCredits: () async -> Void
    let onVerifyPurchase: (VerificationResult<StoreKit.Transaction>?) async -> Void
    let onSignOut: () async -> Void
    let onDeleteAccount: () async -> Void

    @State private var showDeleteConfirmation = false
    @State private var showSignOutConfirmation = false
    @State private var showRestartConfirmation = false

    var body: some View {
        NavigationStack {
            ZStack {
                NebulaBackground().ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 32) {
                        profileHeader
                            .staggeredReveal(index: 0)

                        creditsSection
                            .staggeredReveal(index: 1)

                        gatewaySection
                            .staggeredReveal(index: 2)

                        resourcesSection
                            .staggeredReveal(index: 3)

                        actionsSection
                            .staggeredReveal(index: 4)
                            .padding(.top, 10)
                    }
                    .padding(20)
                    .padding(.bottom, 30)
                }
            }
            .tapToDismissKeyboard()
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .font(CloseClawTheme.Typography.body().weight(.bold))
                    .foregroundStyle(CloseClawTheme.textSecondary)
                }
            }
            .alert("Delete Account", isPresented: $showDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    Task { await onDeleteAccount() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This action is permanent. All your instances, tasks, and history will be wiped immediately. Are you sure?")
            }
            .alert("Sign Out", isPresented: $showSignOutConfirmation) {
                Button("Sign Out", role: .destructive) {
                    Task { await onSignOut() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Are you sure you want to sign out of your session?")
            }
            .alert("Restart Gateway", isPresented: $showRestartConfirmation) {
                Button("Restart", role: .destructive) {
                    Task { await onRestartGateway() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This will send a fresh configuration patch and restart your Gateway. Active agents will be interrupted. Continue?")
            }
            .alert("Core Update Error", isPresented: Binding(
                get: { creditsViewModel.errorMessage != nil },
                set: { if !$0 { creditsViewModel.errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) { creditsViewModel.errorMessage = nil }
            } message: {
                if let error = creditsViewModel.errorMessage {
                    Text(error)
                }
            }
        }
    }

    @ViewBuilder
    private var profileHeader: some View {
        VStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(CloseClawTheme.accentPrimary.opacity(0.1))
                    .frame(width: 80, height: 80)
                    .overlay(
                        Circle()
                            .stroke(CloseClawTheme.accentPrimary.opacity(0.2), lineWidth: 1)
                    )
                
                Image(systemName: "person.fill")
                    .font(.system(size: 32))
                    .foregroundStyle(CloseClawTheme.accentPrimary)
                    .shadow(color: CloseClawTheme.accentGlow, radius: 10)
            }
            .closeClawGlassCard(cornerRadius: 40, padding: 0)
            
            VStack(spacing: 4) {
                Text(user?.email ?? "User Session")
                    .font(CloseClawTheme.Typography.headline())
                    .foregroundStyle(CloseClawTheme.textPrimary)
                
                Text("Active Session")
                    .font(CloseClawTheme.Typography.footnote())
                    .foregroundStyle(CloseClawTheme.accentSecondary)
            }
        }
        .padding(.top, 20)
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var creditsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Usage & Billing")
                .font(CloseClawTheme.Typography.subtitle())
                .foregroundStyle(CloseClawTheme.textSecondary)
                .padding(.leading, 4)
            
            NavigationLink {
                CreditsTabView(
                    viewModel: creditsViewModel,
                    purchaseService: purchaseService,
                    onRefresh: onRefreshCredits,
                    onVerify: onVerifyPurchase
                )
            } label: {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("Current Balance")
                            .font(CloseClawTheme.Typography.footnote())
                            .foregroundStyle(CloseClawTheme.textSecondary)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12))
                            .foregroundStyle(CloseClawTheme.textSecondary)
                    }
                    
                    if creditsViewModel.isLoading {
                        ProgressView()
                            .tint(CloseClawTheme.accentPrimary)
                            .padding(.vertical, 10)
                    } else if let credits = creditsViewModel.credits {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text("\(String(format: "%.2f", credits.api_credits))")
                                .font(CloseClawTheme.Typography.title(32))
                                .premiumTextGradient()
                            
                            Text("Credits")
                                .font(CloseClawTheme.Typography.body())
                                .foregroundStyle(CloseClawTheme.textSecondary)
                        }
                        
                        HStack {
                            Image(systemName: credits.plan == "platform" ? "star.fill" : "seal.fill")
                                .foregroundStyle(CloseClawTheme.accentSecondary)
                            Text(credits.plan == "platform" ? "Platform Plan" : "Free Plan")
                                .font(CloseClawTheme.Typography.footnote())
                                .foregroundStyle(CloseClawTheme.textSecondary)
                            
                            Spacer()
                            
                            Text("Top Up")
                                .font(CloseClawTheme.Typography.footnote().weight(.bold))
                                .foregroundStyle(CloseClawTheme.accentPrimary)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 4)
                                .background(CloseClawTheme.accentPrimary.opacity(0.1))
                                .clipShape(Capsule())
                        }
                    } else {
                        Text("No balance data")
                            .font(CloseClawTheme.Typography.body())
                            .foregroundStyle(CloseClawTheme.textSecondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .closeClawGlassCard(cornerRadius: 24)
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var gatewaySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Core Connection")
                .font(CloseClawTheme.Typography.subtitle())
                .foregroundStyle(CloseClawTheme.textSecondary)
                .padding(.leading, 4)
            
            VStack(spacing: 20) {
                HStack {
                    Label("Gateway Status", systemImage: "antenna.radiowaves.left.and.right")
                        .font(CloseClawTheme.Typography.body())
                    Spacer()
                    HStack(spacing: 6) {
                        Circle()
                            .fill(gatewayStatusText == "Connected" ? CloseClawTheme.accentSecondary : CloseClawTheme.accentPrimary)
                            .frame(width: 8, height: 8)
                        Text(gatewayStatusText)
                            .font(CloseClawTheme.Typography.body())
                            .foregroundStyle(gatewayStatusText == "Connected" ? CloseClawTheme.accentSecondary : CloseClawTheme.accentPrimary)
                    }
                }
                
                VStack(spacing: 12) {
                    CloseClawButton(
                        title: "Restart Gateway",
                        variant: .secondary,
                        action: {
                            showRestartConfirmation = true
                        }
                    )
                    .opacity(0.8)
                    
                    Text("Restarting reapplies default configuration. Only use if connection is unstable.")
                        .font(CloseClawTheme.Typography.footnote())
                        .foregroundStyle(CloseClawTheme.textSecondary)
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
            }
            .closeClawGlassCard(cornerRadius: 24)
        }
    }

    @ViewBuilder
    private var resourcesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Resources")
                .font(CloseClawTheme.Typography.subtitle())
                .foregroundStyle(CloseClawTheme.textSecondary)
                .padding(.leading, 4)
            
            VStack(spacing: 0) {
                Link(destination: URL(string: "https://closeclaw.in/privacy")!) {
                    HStack {
                        Label("Privacy Policy", systemImage: "shield.lefthalf.filled")
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(CloseClawTheme.textSecondary)
                    }
                    .padding(.vertical, 16)
                }
                
                Divider().overlay(CloseClawTheme.cardBorder)
                
                Link(destination: URL(string: "https://closeclaw.in/terms")!) {
                    HStack {
                        Label("Terms of Service", systemImage: "doc.text")
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(CloseClawTheme.textSecondary)
                    }
                    .padding(.vertical, 16)
                }
            }
            .font(CloseClawTheme.Typography.body())
            .foregroundStyle(CloseClawTheme.textPrimary)
            .padding(.horizontal, 16)
            .background(CloseClawTheme.surfaceBase)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(CloseClawTheme.cardBorder, lineWidth: 1)
            )
        }
    }

    @ViewBuilder
    private var actionsSection: some View {
        VStack(spacing: 16) {
            CloseClawButton(
                title: "Sign Out",
                variant: .secondary,
                action: {
                    showSignOutConfirmation = true
                }
            )
            
            CloseClawButton(
                title: isLoadingDelete ? "Deleting..." : "Delete Account",
                variant: .destructive,
                isLoading: isLoadingDelete,
                action: {
                    showDeleteConfirmation = true
                }
            )
        }
    }
}
