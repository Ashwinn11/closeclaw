import SwiftUI

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
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Restoring session...")
                            .foregroundStyle(CloseClawTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
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
                    MainTabsView(viewModel: viewModel)
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
            ScrollView {
                VStack(spacing: 18) {
                    VStack(spacing: 12) {
                        Image("BrandMark")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 72, height: 72)
                            .shadow(color: CloseClawTheme.accentGlow, radius: 16)

                        Text("Welcome to CloseClaw")
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                            .foregroundStyle(CloseClawTheme.textPrimary)

                        Text("Set up your private instance before entering the app.")
                            .font(.subheadline)
                            .foregroundStyle(CloseClawTheme.textSecondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 20)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Onboarding")
                            .font(.headline)
                            .foregroundStyle(CloseClawTheme.textPrimary)
                        Text("1. Verify account")
                            .foregroundStyle(CloseClawTheme.textSecondary)
                        Text("2. Activate instance")
                            .foregroundStyle(CloseClawTheme.textSecondary)
                        Text("3. Connect channels (next)")
                            .foregroundStyle(CloseClawTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .closeClawGlassCard()

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Paywall Hook")
                            .font(.headline)
                            .foregroundStyle(CloseClawTheme.textPrimary)
                        Text("Paywall is not enforced yet in iOS. Keep this gate before provisioning so we can require subscription later.")
                            .font(.footnote)
                            .foregroundStyle(CloseClawTheme.textSecondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .closeClawGlassCard()

                    Button {
                        Task { await onProvision() }
                    } label: {
                        HStack {
                            if isProvisioning {
                                ProgressView()
                                    .tint(CloseClawTheme.textPrimary)
                            }
                            Text(isProvisioning ? "Activating..." : "Activate My Instance")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                    }
                    .buttonStyle(.plain)
                    .background(CloseClawTheme.accentPrimary)
                    .foregroundStyle(CloseClawTheme.textPrimary)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .disabled(isProvisioning)

                    Button {
                        Task { await onSignOut() }
                    } label: {
                        Text("Sign out")
                            .font(.footnote)
                            .foregroundStyle(CloseClawTheme.textSecondary)
                    }
                    .buttonStyle(.plain)
                }
                .padding(20)
            }
            .background(CloseClawTheme.bgRoot.ignoresSafeArea())
        }
    }
}

private struct MainTabsView: View {
    @ObservedObject var viewModel: AppViewModel

    var body: some View {
        TabView {
            ChatTabView(viewModel: viewModel.chatViewModel)
                .tabItem {
                    Label("Chat", systemImage: "message")
                }

            TasksTabView(viewModel: viewModel.tasksViewModel, onRefresh: {
                await viewModel.refreshTasks()
            })
            .tabItem {
                Label("Tasks", systemImage: "clock.arrow.circlepath")
            }

            CreditsTabView(viewModel: viewModel.creditsViewModel, onRefresh: {
                await viewModel.refreshCredits()
            })
            .tabItem {
                Label("Credits", systemImage: "creditcard")
            }

            SettingsTabView(
                user: viewModel.user,
                gatewayStatusText: viewModel.gatewayStatusText,
                onReconnect: {
                    await viewModel.reconnectGateway()
                },
                onSignOut: {
                    await viewModel.signOut()
                }
            )

            .tabItem {
                Label("Settings", systemImage: "gearshape")
            }
        }
        .tint(CloseClawTheme.accentPrimary)
        .toolbarBackground(CloseClawTheme.bgRoot, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
    }
}
