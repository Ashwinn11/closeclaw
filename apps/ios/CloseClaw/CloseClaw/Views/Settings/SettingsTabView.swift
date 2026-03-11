import SwiftUI

struct SettingsTabView: View {
    let user: UserProfile?
    let gatewayStatusText: String
    @ObservedObject var creditsViewModel: CreditsViewModel
    var isLoadingReconnect: Bool = false
    var isLoadingDelete: Bool = false
    let onReconnect: () async -> Void
    let onSignOut: () async -> Void
    let onDeleteAccount: () async -> Void

    @State private var showDeleteConfirmation = false

    var body: some View {
        NavigationStack {
            ZStack {
                NebulaBackground().ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 32) {
                        // Profile Header
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
                        .staggeredReveal(index: 0)

                        // Credits Section
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Usage & Billing")
                                .font(CloseClawTheme.Typography.subtitle())
                                .foregroundStyle(CloseClawTheme.textSecondary)
                                .padding(.leading, 4)
                            
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Current Balance")
                                    .font(CloseClawTheme.Typography.footnote())
                                    .foregroundStyle(CloseClawTheme.textSecondary)
                                
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
                                        Image(systemName: "checkmark.seal.fill")
                                            .foregroundStyle(CloseClawTheme.accentSecondary)
                                        Text("Plan: \(credits.plan.capitalized)")
                                            .font(CloseClawTheme.Typography.footnote())
                                            .foregroundStyle(CloseClawTheme.textSecondary)
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
                        .staggeredReveal(index: 1)

                        // Gateway Section
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
                                
                                CloseClawButton(
                                    title: isLoadingReconnect ? "Reconnecting..." : "Reconnect Gateway",
                                    variant: .secondary,
                                    isLoading: isLoadingReconnect,
                                    action: {
                                        Task { await onReconnect() }
                                    }
                                )
                            }
                            .closeClawGlassCard(cornerRadius: 24)
                        }
                        .staggeredReveal(index: 2)

                        // Legal Section
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
                        .staggeredReveal(index: 3)

                        // Action Section
                        VStack(spacing: 20) {
                            CloseClawButton(
                                title: "Sign Out",
                                variant: .ghost,
                                action: {
                                    Task { await onSignOut() }
                                }
                            )
                            .background(Color.white.opacity(0.04))
                            .clipShape(Capsule())
                            
                            Button(role: .destructive) {
                                showDeleteConfirmation = true
                            } label: {
                                Group {
                                    if isLoadingDelete {
                                        ProgressView().tint(CloseClawTheme.accentPrimary)
                                    } else {
                                        Text("Delete Account")
                                            .font(CloseClawTheme.Typography.footnote())
                                    }
                                }
                                .foregroundStyle(CloseClawTheme.accentPrimary.opacity(0.8))
                                .frame(maxWidth: .infinity)
                            }
                            .disabled(isLoadingDelete)
                        }
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
            .alert("Delete Account", isPresented: $showDeleteConfirmation) {
                Button("Delete", role: .destructive) {
                    Task { await onDeleteAccount() }
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("This action is permanent. All your instances, tasks, and history will be wiped immediately. Are you sure?")
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
}
