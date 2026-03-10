import SwiftUI

@main
struct CloseClawApp: App {
    private let bootstrapResult: BootstrapResult

    init() {
        do {
            let config = try AppConfig.load()
            let tokenStore = KeychainTokenStore()
            let authService = AuthService(config: config, tokenStore: tokenStore)
            let apiClient = APIClient(baseURL: config.apiBaseURL)
            let gatewayClient = GatewayWebSocketClient(apiBaseURL: config.apiBaseURL)
            let viewModel = AppViewModel(
                authService: authService,
                apiClient: apiClient,
                gatewayClient: gatewayClient
            )
            bootstrapResult = .success(viewModel)
        } catch {
            bootstrapResult = .failure(error.localizedDescription)
        }
    }

    var body: some Scene {
        WindowGroup {
            ZStack {
                CloseClawTheme.bgRoot
                    .ignoresSafeArea()
                switch bootstrapResult {
                case let .success(viewModel):
                    RootView(viewModel: viewModel)
                case let .failure(message):
                    LaunchErrorView(message: message)
                }
            }
            .tint(CloseClawTheme.accentPrimary)
            .preferredColorScheme(.dark)
        }
    }
}

private enum BootstrapResult {
    case success(AppViewModel)
    case failure(String)
}

private struct LaunchErrorView: View {
    let message: String

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(CloseClawTheme.accentPrimary)
            Text("CloseClaw Could Not Start")
                .font(.title3.weight(.semibold))
                .foregroundStyle(CloseClawTheme.textPrimary)
            Text(message)
                .multilineTextAlignment(.center)
                .foregroundStyle(CloseClawTheme.textSecondary)
                .padding(.horizontal)
        }
        .padding(24)
        .closeClawGlassCard()
        .padding()
    }
}
