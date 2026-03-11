import SwiftUI
import StoreKit

struct RootView: View {
    @StateObject private var viewModel: AppViewModel

    init(viewModel: AppViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        ZStack {
            CloseClawTheme.bgRoot
                .ignoresSafeArea()
            Group {
                switch viewModel.authPhase {
                case .loading:
                    LoadingView()
                case .signedOut:
                    AuthView(
                        isLoading: viewModel.isAuthenticating,
                        onSignInWithApple: { idToken, nonce, fullName, email in
                            await viewModel.signInWithApple(
                                idToken: idToken,
                                nonce: nonce,
                                fullName: fullName,
                                email: email
                            )
                        }
                    )
                case .paywall:
                    PaywallView(
                        viewModel: viewModel,
                        purchaseService: viewModel.purchaseService
                    )
                case .onboarding:
                    OnboardingView(
                        isProvisioning: viewModel.isProvisioningInstance,
                        onProvision: {
                            await viewModel.claimInstanceFromOnboarding()
                        },
                        onSignOut: {
                            await viewModel.signOut()
                        }
                    )
                case .signedIn:
                    ChatViewContainer(viewModel: viewModel)
                }
            }
        }
        .task {
            await viewModel.bootstrapIfNeeded()
        }
        .alert(
            "Something Went Wrong",
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { value in
                    if !value { viewModel.clearError() }
                }
            )
        ) {
            Button("OK", role: .cancel) {
                viewModel.clearError()
            }
        } message: {
            Text(viewModel.errorMessage ?? "")
                .foregroundStyle(CloseClawTheme.textSecondary)
        }
    }
}

private struct OnboardingView: View {
    let isProvisioning: Bool
    let onProvision: () async -> Void
    let onSignOut: () async -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                NebulaBackground().ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 32) {
                        VStack(spacing: 16) {
                            AppLogo(size: 80)

                            VStack(spacing: 8) {
                                Text("Step 2: Core Setup")
                                    .font(CloseClawTheme.Typography.title())
                                    .premiumTextGradient()
                                
                                Text("We're bringing your private, dedicated processing unit online.")
                                    .font(CloseClawTheme.Typography.body())
                                    .foregroundStyle(CloseClawTheme.textPrimary)
                                    .multilineTextAlignment(.center)
                            }
                        }
                        .padding(.top, 40)
                        .staggeredReveal(index: 0)

                        VStack(spacing: 20) {
                            OnboardingStepRow(
                                number: "01",
                                title: "Identity Verified",
                                description: "Your secure session is active.",
                                isCompleted: true
                            )
                            
                            OnboardingStepRow(
                                number: "02",
                                title: "Activate Core",
                                description: "Provisioning your personal processing unit.",
                                isCurrent: true
                            )
                            
                            OnboardingStepRow(
                                number: "03",
                                title: "Connect Channels",
                                description: "Bridge your tools directly into the chat.",
                                isLocked: true
                            )
                        }
                        .padding(20)
                        .background(
                            CloseClawTheme.surfaceBase
                                .background(.ultraThinMaterial)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .stroke(CloseClawTheme.cardBorder, lineWidth: 1)
                        )
                        .staggeredReveal(index: 1)

                        VStack(spacing: 16) {
                            CloseClawButton(
                                title: isProvisioning ? "Activating Core..." : "Activate My Environment",
                                isLoading: isProvisioning,
                                action: {
                                    Task { await onProvision() }
                                }
                            )

                            Button {
                                Task { await onSignOut() }
                            } label: {
                                Text("Sign out")
                                    .font(CloseClawTheme.Typography.footnote())
                                    .foregroundStyle(CloseClawTheme.textSecondary)
                            }
                            .buttonStyle(.plain)
                        }
                        .staggeredReveal(index: 2)
                    }
                    .padding(24)
                }
            }
            .tapToDismissKeyboard()
            .onAppear {
                if let windowScene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                    SKStoreReviewController.requestReview(in: windowScene)
                }
            }
        }
    }

}

private struct OnboardingStepRow: View {
    let number: String
    let title: String
    let description: String
    var isCompleted: Bool = false
    var isCurrent: Bool = false
    var isLocked: Bool = false
    
    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(circleBackground)
                    .frame(width: 36, height: 36)
                
                if isCompleted {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                } else {
                    Text(number)
                        .font(CloseClawTheme.Typography.footnote())
                        .foregroundStyle(numberColor)
                }
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(CloseClawTheme.Typography.body())
                    .foregroundStyle(isLocked ? CloseClawTheme.textSecondary : CloseClawTheme.textPrimary)
                
                Text(description)
                    .font(CloseClawTheme.Typography.footnote())
                    .foregroundStyle(CloseClawTheme.textSecondary.opacity(0.8))
            }
            
            Spacer()
        }
        .opacity(isLocked ? 0.5 : 1.0)
    }
    
    private var circleBackground: Color {
        if isCompleted { return CloseClawTheme.accentSecondary }
        if isCurrent { return CloseClawTheme.accentPrimary }
        return CloseClawTheme.surfaceHover
    }
    
    private var numberColor: Color {
        isCurrent ? .white : CloseClawTheme.textSecondary
    }
}

private struct ChatViewContainer: View {
    @ObservedObject var viewModel: AppViewModel
    @State private var showingSettings = false
    
    var body: some View {
        ChatTabView(
            viewModel: viewModel.chatViewModel,
            onShowSettings: {
                showingSettings = true
            }
        )
        .sheet(isPresented: $showingSettings) {
                SettingsTabView(
                    user: viewModel.user,
                    gatewayStatusText: viewModel.gatewayStatusText,
                    creditsViewModel: viewModel.creditsViewModel,
                    purchaseService: viewModel.purchaseService,
                    isLoadingReconnect: viewModel.isReconnectingGateway,
                    isLoadingDelete: viewModel.isAuthenticating,
                    onReconnect: {
                        await viewModel.reconnectGateway()
                    },
                    onRefreshCredits: {
                        await viewModel.refreshCredits()
                    },
                    onVerifyPurchase: { result in
                        await viewModel.handlePurchaseSuccess(result: result)
                    },
                    onSignOut: {
                        await viewModel.signOut()
                    },
                    onDeleteAccount: {
                        await viewModel.deleteAccount()
                    }
                )
        }
    }
}

private struct LoadingView: View {
    var body: some View {
        VStack(spacing: 24) {
            AppLogo(size: 100, pulsing: true)
            
            Text("Authenticating Core...")
                .font(CloseClawTheme.Typography.subtitle())
                .foregroundStyle(CloseClawTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
