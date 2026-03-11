import Foundation

@MainActor
final class AppViewModel: ObservableObject {
    enum AuthPhase: Equatable {
        case loading
        case signedOut
        case onboarding
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

    private let authService: AuthServiceProtocol
    private let apiClient: APIClientProtocol
    private var didBootstrap = false
    private var hasCompletedInitialSetup: Bool {
        get { UserDefaults.standard.bool(forKey: "hasCompletedInitialSetup") }
        set { UserDefaults.standard.set(newValue, forKey: "hasCompletedInitialSetup") }
    }
    private var stateObservationTask: Task<Void, Never>?

    init(
        authService: AuthServiceProtocol,
        apiClient: APIClientProtocol,
        gatewayClient: GatewayWebSocketClient
    ) {
        self.authService = authService
        self.apiClient = apiClient
        self.gatewayClient = gatewayClient
        self.chatViewModel = ChatViewModel(gatewayClient: gatewayClient)
        self.creditsViewModel = CreditsViewModel(apiClient: apiClient)

        setupStateObservation()
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
            authPhase = .signedOut
            errorMessage = error.localizedDescription
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
        chatViewModel.clear()
        creditsViewModel.clear()
        await authService.signOut(session: oldSession)

        session = nil
        user = nil
        isProvisioningInstance = false
        hasPatchedConfig = false
        authPhase = .signedOut
    }

    func deleteAccount() async {
        guard let session else { return }
        isAuthenticating = true
        defer { isAuthenticating = false }

        do {
            try await authService.deleteAccount(session: session)
            gatewayClient.disconnect()
            chatViewModel.clear()
            creditsViewModel.clear()
            self.session = nil
            self.user = nil
            isProvisioningInstance = false
            hasPatchedConfig = false
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

        await loadCurrentUser(accessToken: session.accessToken)
        let hasActiveInstance = await connectGatewayIfInstanceAvailable(accessToken: session.accessToken)
        await creditsViewModel.load(accessToken: session.accessToken)
        authPhase = hasActiveInstance ? .signedIn : .onboarding
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

        isProvisioningInstance = true
        defer { isProvisioningInstance = false }

        do {
            _ = try await apiClient.claimInstance(accessToken: accessToken)
            
            // Attempt to connect immediately.
            // connectGatewayIfInstanceAvailable returns true if an instance record exists.
            _ = await connectGatewayIfInstanceAvailable(accessToken: accessToken)
            
            // Poll for connection success (up to 30 seconds)
            // GatewayWebSocketClient now handles its own exponential backoff retries.
            var attempts = 0
            while gatewayClient.state != .connected && attempts < 30 {
                try? await Task.sleep(nanoseconds: 1_000_000_000) // 1s
                attempts += 1
                
                // If the state somehow becomes disconnected (not just failing/retrying), 
                // we might want to break early or re-trigger. 
                // But with auto-reconnect, it should stay in .failed or .connecting.
                if case .disconnected = gatewayClient.state {
                    break
                }
            }

            // Move to signedIn phase regardless if we at least have an instance now.
            // The gateway will continue to try and connect in the background.
            await creditsViewModel.load(accessToken: accessToken)
            authPhase = .signedIn
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func connectGatewayIfInstanceAvailable(accessToken: String) async -> Bool {
        do {
            let instance = try await apiClient.getMyInstance(accessToken: accessToken)
            guard instance != nil else { return false }
            do {
                try await gatewayClient.connect(accessToken: accessToken)
            } catch {
                // Instance exists; keep app unlocked while auto-reconnect retries.
                // We don't throw here so the caller knows the instance record is valid.
                print("[AppViewModel] Initial Gateway connection failed: \(error)")
            }
            return true

        } catch {
            errorMessage = error.localizedDescription
            return false
        }
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
