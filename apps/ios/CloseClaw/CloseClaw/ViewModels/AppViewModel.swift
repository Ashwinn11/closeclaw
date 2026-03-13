import Foundation
import StoreKit

@MainActor
final class AppViewModel: ObservableObject {
    enum AuthPhase: Equatable {
        case loading
        case signedOut
        case onboarding
        case paywall
        case signedIn
    }

    @Published private(set) var authPhase: AuthPhase = .loading
    @Published private(set) var user: UserProfile?
    @Published private(set) var session: AppSession?
    @Published private(set) var isAuthenticating = false
    @Published private(set) var isProvisioningInstance = false
    @Published private(set) var isReconnectingGateway = false
    @Published var errorMessage: String?

    let gatewayClient: GatewayWebSocketClient
    let chatViewModel: ChatViewModel
    let creditsViewModel: CreditsViewModel
    let purchaseService: PurchaseService

    private let authService: AuthServiceProtocol
    private let apiClient: APIClientProtocol
    private var didBootstrap = false
    private var hasCompletedInitialSetup: Bool {
        get { UserDefaults.standard.bool(forKey: "hasCompletedInitialSetup") }
        set { UserDefaults.standard.set(newValue, forKey: "hasCompletedInitialSetup") }
    }
    private var stateObservationTask: Task<Void, Never>?
    private var sessionRefreshTask: Task<Void, Never>?

    init(
        authService: AuthServiceProtocol,
        apiClient: APIClientProtocol,
        gatewayClient: GatewayWebSocketClient,
        purchaseService: PurchaseService
    ) {
        self.authService = authService
        self.apiClient = apiClient
        self.gatewayClient = gatewayClient
        self.purchaseService = purchaseService
        self.chatViewModel = ChatViewModel(gatewayClient: gatewayClient)
        self.creditsViewModel = CreditsViewModel(apiClient: apiClient)

        setupStateObservation()
        setupSessionRefresh()
    }

    private func setupStateObservation() {
        stateObservationTask = Task { [weak self] in
            guard let self else { return }
            // Observe state changes via the Published property
            for await state in gatewayClient.$state.values {
                if case .connected = state {
                    await self.handleGatewayConnected()
                }
            }
        }
    }

    private func setupSessionRefresh() {
        sessionRefreshTask = Task { [weak self] in
            while !Task.isCancelled {
                // Check token health every 60 seconds
                try? await Task.sleep(nanoseconds: 60 * 1_000_000_000)
                guard let self else { return }
                await self.refreshSessionIfNeeded()
            }
        }
    }

    private func refreshSessionIfNeeded() async {
        guard let current = session, current.isExpired else { return }
        
        do {
            print("[AppViewModel] Proactively refreshing session...")
            let refreshed = try await authService.refreshSession(current)
            self.session = refreshed
            self.user = refreshed.user
        } catch {
            print("[AppViewModel] Background session refresh failed: \(error)")
            if isHardAuthError(error) {
                self.session = nil
                self.user = nil
                self.authPhase = .signedOut
            }
        }
    }

    private func handleGatewayConnected() async {
        guard let session, !hasCompletedInitialSetup else { 
            chatViewModel.activate()
            return 
        }
        
        do {
            try await applyGatewayProxyConfiguration(accessToken: session.accessToken)
            hasCompletedInitialSetup = true
            chatViewModel.activate()
        } catch {
            print("[AppViewModel] Failed to apply config after connection: \(error)")
        }
    }

    private func isHardAuthError(_ error: Error) -> Bool {
        // If it's a 400 error from Supabase, the refresh token is dead.
        // If it's a network error (URLError), we should keep the session.
        if let authError = error as? AuthError {
            if case let .supabase(status, _) = authError, status == 400 {
                return true
            }
        }
        return false
    }


    func bootstrapIfNeeded() async {
        guard !didBootstrap else { return }
        didBootstrap = true
        await bootstrap()
    }

    func bootstrap() async {
        authPhase = .loading
        do {
            if let restored = try await authService.restoreSession() {
                session = restored
                user = restored.user
                await postAuthBootstrap()
            } else {
                authPhase = .signedOut
            }
        } catch {
            print("[AppViewModel] Bootstrap failed: \(error)")
            if isHardAuthError(error) {
                authPhase = .signedOut
            } else {
                // Network error. Keep current session if we have one.
                errorMessage = "Network error: \(error.localizedDescription). Please check your connection."
                // Stay in .loading but allow them to retry or just see the error.
                // We don't sign out because the token might still be valid once signal returns.
            }
        }
    }

    func signIn(email: String, password: String) async {
        isAuthenticating = true
        defer { isAuthenticating = false }

        do {
            let newSession = try await authService.signIn(email: email, password: password)
            session = newSession
            user = newSession.user
            authPhase = .loading
            errorMessage = nil
            await postAuthBootstrap()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signInWithApple(
        idToken: String,
        nonce: String,
        fullName: String?,
        email: String?
    ) async {
        isAuthenticating = true
        defer { isAuthenticating = false }

        do {
            let newSession = try await authService.signInWithApple(
                idToken: idToken,
                nonce: nonce,
                fullName: fullName,
                email: email
            )
            session = newSession
            user = newSession.user
            authPhase = .loading
            errorMessage = nil
            await postAuthBootstrap()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        let oldSession = session
        gatewayClient.disconnect()
        // Pass deletePersistedCache: false — preserve the user's chat history
        // so it reloads when they sign back in with the same account.
        chatViewModel.clear(deletePersistedCache: false)
        creditsViewModel.clear()
        await authService.signOut(session: oldSession)

        session = nil
        user = nil
        isProvisioningInstance = false
        hasCompletedInitialSetup = false
        authPhase = .signedOut
    }

    func deleteAccount() async {
        guard let session else { return }
        isAuthenticating = true
        defer { isAuthenticating = false }

        do {
            try await authService.deleteAccount(session: session)
            gatewayClient.disconnect()
            // Wipe the cache permanently — this user is gone
            chatViewModel.clear(deletePersistedCache: true)
            creditsViewModel.clear()
            self.session = nil
            self.user = nil
            isProvisioningInstance = false
            hasCompletedInitialSetup = false
            authPhase = .signedOut
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshCredits() async {
        guard let accessToken = session?.accessToken else { return }
        await creditsViewModel.load(accessToken: accessToken)
    }


    func reconnectGateway() async {
        guard let accessToken = session?.accessToken else { return }
        isReconnectingGateway = true
        defer { isReconnectingGateway = false }
        
        gatewayClient.disconnect()
        _ = await connectGatewayIfInstanceAvailable(accessToken: accessToken)
        
        // Brief delay to show connecting state if it connects instantly
        try? await Task.sleep(nanoseconds: 500_000_000)
    }

    func clearError() {
        errorMessage = nil
    }

    var gatewayStatusText: String {
        switch gatewayClient.state {
        case .disconnected:
            return "Disconnected"
        case .connecting:
            return "Connecting"
        case .connected:
            return "Connected"
        case let .failed(message):
            return "Failed: \(message)"
        }
    }

    private func postAuthBootstrap() async {
        guard let session else { return }

        // Start loading history IMMEDIATELY
        let uid = user?.id ?? session.user.id
        chatViewModel.reloadForUser(uid)

        do {
            async let me: Void = loadCurrentUser(accessToken: session.accessToken)
            async let credits: Void = creditsViewModel.load(accessToken: session.accessToken)
            _ = await (me, credits)
            
            // Step 1 of Funnel: Check if user has an instance yet
            let hasActiveInstance = try await connectGatewayIfInstanceAvailable(accessToken: session.accessToken)
            
            if hasActiveInstance {
                if creditsViewModel.credits?.plan != "platform" {
                    authPhase = .paywall
                } else {
                    authPhase = .signedIn
                }
            } else {
                authPhase = .onboarding
            }
        } catch {
            print("[AppViewModel] postAuthBootstrap network failure: \(error)")
            errorMessage = "Unable to reach server. Please check your connection."
            // CRITICAL: We stay in .loading (or keep current phase). 
            // We do NOT set .onboarding, because that would ghost the user's existing instance.
        }
    }

    private func loadCurrentUser(accessToken: String) async {
        do {
            let profile = try await apiClient.getMe(accessToken: accessToken)
            user = profile
        } catch {
            // Session payload already includes user id/email; keep that as fallback.
            errorMessage = error.localizedDescription
        }
    }

    func claimInstanceFromOnboarding() async {
        guard let accessToken = session?.accessToken else { return }

        if creditsViewModel.credits?.plan != "platform" {
            // Step 3 of Funnel: Intercept the 'Activate' click if they haven't paid.
            authPhase = .paywall
            return
        }

        // Prevent double-fires
        guard !isProvisioningInstance else { return }

        // Switch to onboarding view to show the 'Provisioning...' state
        authPhase = .onboarding
        isProvisioningInstance = true
        defer { isProvisioningInstance = false }
        
        do {
            _ = try await apiClient.claimInstance(accessToken: accessToken)
            
            // Attempt to connect immediately.
            _ = await connectGatewayIfInstanceAvailable(accessToken: accessToken)
            
            // Poll for connection success
            var attempts = 0
            while gatewayClient.state != .connected && attempts < 30 {
                try? await Task.sleep(nanoseconds: 1_000_000_000) // 1s
                attempts += 1
                
                if case .disconnected = gatewayClient.state {
                    break
                }
            }

            await creditsViewModel.load(accessToken: accessToken)
            authPhase = .signedIn
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func connectGatewayIfInstanceAvailable(accessToken: String) async throws -> Bool {
        let instance = try await apiClient.getMyInstance(accessToken: accessToken)
        guard instance != nil else { return false }
        
        do {
            try await gatewayClient.connect(accessToken: accessToken)
        } catch {
            // Instance exists; keep app unlocked while auto-reconnect retries.
            print("[AppViewModel] Initial Gateway connection failed: \(error)")
        }
        return true
    }


    private func applyGatewayProxyConfiguration(accessToken: String) async throws {
        // 1. Fetch current Gateway config to check if we actually need to patch
        let current = try await gatewayClient.rpc(method: "config.get")
        guard let currentObject = current.objectValue else {
            throw AppViewModelError.invalidGatewayConfig("Gateway config.get failed")
        }
        
        // 2. If the config already has providers and agents, it is ALREADY SETUP.
        // Per user request, we must avoid config.patch unless it's the first-time setup,
        // because patching triggers a Gateway restart which kills the agent's work.
        if let currentProviders = currentObject["providers"]?.objectValue, 
           !currentProviders.isEmpty,
           currentObject["agents"] != nil {
            print("[AppViewModel] Gateway already setup with providers. Skipping config.patch to avoid redundant restart.")
            return
        }

        print("[AppViewModel] Gateway configuration missing or empty. Performing first-time setup...")
        
        // 3. Fetch desired provider configuration from backend
        let providerPatchValue = try await apiClient.getGatewayProviderConfig(accessToken: accessToken)
        guard let providerPatch = providerPatchValue.objectValue else {
            throw AppViewModelError.invalidGatewayConfig("Provider patch payload was not an object.")
        }

        // 4. Build our full desired patch
        var desiredPatch = buildGatewayDefaultsPatch()
        for (key, value) in providerPatch {
            desiredPatch[key] = value
        }

        // 5. Apply the patch
        try await patchGatewayConfigWithRetry(desiredPatch)
    }

    private func patchGatewayConfigWithRetry(_ patch: [String: JSONValue]) async throws {
        let rawObject = patch.mapValues(\.asAny)
        let rawData = try JSONSerialization.data(withJSONObject: rawObject)
        guard let rawPatch = String(data: rawData, encoding: .utf8) else {
            throw AppViewModelError.invalidGatewayConfig("Could not serialize Gateway patch JSON.")
        }

        for attempt in 0 ..< 2 {
            let current = try await gatewayClient.rpc(method: "config.get")
            guard
                let currentObject = current.objectValue,
                let hash = currentObject["hash"]?.stringValue,
                !hash.isEmpty
            else {
                throw AppViewModelError.invalidGatewayConfig("Gateway config.get returned no hash.")
            }

            do {
                _ = try await gatewayClient.rpc(
                    method: "config.patch",
                    params: [
                        "raw": .string(rawPatch),
                        "baseHash": .string(hash)
                    ]
                )
                return
            } catch {
                if attempt == 1 {
                    throw error
                }
            }
        }
    }

    private func buildGatewayDefaultsPatch() -> [String: JSONValue] {
        [
            "agents": .object([
                "defaults": .object([
                    "model": .object([
                        "primary": .string("closeclaw-google/gemini-3-flash-preview"),
                        "fallbacks": .array([
                            .string("closeclaw-anthropic/claude-sonnet-4-6"),
                            .string("closeclaw-openai/gpt-5.2-codex")
                        ])
                    ]),
                    "models": .object([
                        "closeclaw-google/gemini-3-flash-preview": .object([
                            "alias": .string("Gemini")
                        ]),
                        "closeclaw-anthropic/claude-sonnet-4-6": .object([
                            "alias": .string("Sonnet")
                        ]),
                        "closeclaw-openai/gpt-5.2-codex": .object([
                            "alias": .string("Codex")
                        ])
                    ])
                ])
            ]),
            "browser": .object([
                "enabled": .bool(true),
                "noSandbox": .bool(true),
                "headless": .bool(true)
            ]),
            "session": .object([
                "dmScope": .string("main")
            ])
        ]
    }

    func handlePurchaseSuccess(result: VerificationResult<StoreKit.Transaction>?) async {
        guard let accessToken = session?.accessToken else { return }
        
        if let result = result {
            do {
                // Send to backend for verification and DB update
                try await apiClient.verifyPurchase(accessToken: accessToken, signedTransaction: result.jwsRepresentation)
            } catch {
                print("[AppViewModel] Backend purchase verification failed: \(error)")
            }
        }
        
        await creditsViewModel.load(accessToken: accessToken)
        
        let hasActiveInstance = await connectGatewayIfInstanceAvailable(accessToken: accessToken)
        if hasActiveInstance {
            authPhase = .signedIn
        } else {
            // Step 4 of Funnel: They just paid but don't have an instance. 
            // Automatically fast-forward them into claiming it so they don't have to click "Activate" again.
            await claimInstanceFromOnboarding()
        }
    }
}

private enum AppViewModelError: LocalizedError {
    case invalidGatewayConfig(String)

    var errorDescription: String? {
        switch self {
        case let .invalidGatewayConfig(message):
            return message
        }
    }
}
