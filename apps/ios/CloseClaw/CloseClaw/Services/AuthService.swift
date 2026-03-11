import Foundation

protocol AuthServiceProtocol {
    func restoreSession() async throws -> AppSession?
    func signIn(email: String, password: String) async throws -> AppSession
    func signInWithApple(
        idToken: String,
        nonce: String,
        fullName: String?,
        email: String?
    ) async throws -> AppSession
    func refreshSession(_ session: AppSession) async throws -> AppSession
    func signOut(session: AppSession?) async
    func deleteAccount(session: AppSession) async throws
}

final class AuthService: AuthServiceProtocol {
    private let config: AppConfig
    private let tokenStore: TokenStore
    private let session: URLSession
    private let decoder = JSONDecoder()

    init(config: AppConfig, tokenStore: TokenStore, session: URLSession = .shared) {
        self.config = config
        self.tokenStore = tokenStore
        self.session = session
    }

    func restoreSession() async throws -> AppSession? {
        guard let stored = try tokenStore.loadSession() else {
            return nil
        }
        if stored.isExpired {
            let refreshed = try await refreshSession(stored)
            return refreshed
        }
        return stored
    }

    func signIn(email: String, password: String) async throws -> AppSession {
        guard let url = URL(string: "/auth/v1/token?grant_type=password", relativeTo: config.supabaseURL) else {
            throw AuthError.invalidSupabaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(config.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode([
            "email": email,
            "password": password
        ])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }

        guard http.statusCode >= 200, http.statusCode < 300 else {
            throw parseSupabaseError(from: data, statusCode: http.statusCode)
        }

        let payload = try decoder.decode(SupabaseSessionResponse.self, from: data)
        let session = AppSession(
            accessToken: payload.access_token,
            refreshToken: payload.refresh_token,
            tokenType: payload.token_type,
            expiresAt: Date().addingTimeInterval(payload.expires_in),
            user: UserProfile(
                id: payload.user.id,
                email: payload.user.email ?? ""
            )
        )
        try tokenStore.save(session: session)
        return session
    }

    func signInWithApple(
        idToken: String,
        nonce: String,
        fullName: String?,
        email: String?
    ) async throws -> AppSession {
        guard let url = URL(string: "/auth/v1/token?grant_type=id_token", relativeTo: config.supabaseURL) else {
            throw AuthError.invalidSupabaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(config.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode([
            "provider": "apple",
            "id_token": idToken,
            "nonce": nonce
        ])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }

        guard http.statusCode >= 200, http.statusCode < 300 else {
            throw parseSupabaseError(from: data, statusCode: http.statusCode)
        }

        let payload = try decoder.decode(SupabaseSessionResponse.self, from: data)
        let appSession = AppSession(
            accessToken: payload.access_token,
            refreshToken: payload.refresh_token,
            tokenType: payload.token_type,
            expiresAt: Date().addingTimeInterval(payload.expires_in),
            user: UserProfile(
                id: payload.user.id,
                email: payload.user.email ?? email ?? ""
            )
        )

        try await syncAppleProfileToSupabase(
            session: appSession,
            fullName: fullName,
            email: email
        )

        try tokenStore.save(session: appSession)
        return appSession
    }

    func refreshSession(_ current: AppSession) async throws -> AppSession {
        guard let url = URL(string: "/auth/v1/token?grant_type=refresh_token", relativeTo: config.supabaseURL) else {
            throw AuthError.invalidSupabaseURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(config.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try JSONEncoder().encode([
            "refresh_token": current.refreshToken
        ])

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }
        guard http.statusCode >= 200, http.statusCode < 300 else {
            try? tokenStore.clearSession()
            throw parseSupabaseError(from: data, statusCode: http.statusCode)
        }

        let payload = try decoder.decode(SupabaseSessionResponse.self, from: data)
        let refreshed = AppSession(
            accessToken: payload.access_token,
            refreshToken: payload.refresh_token,
            tokenType: payload.token_type,
            expiresAt: Date().addingTimeInterval(payload.expires_in),
            user: UserProfile(
                id: payload.user.id,
                email: payload.user.email ?? current.user.email
            )
        )
        try tokenStore.save(session: refreshed)
        return refreshed
    }

    func signOut(session: AppSession?) async {
        if let session {
            await sendLogout(accessToken: session.accessToken)
        }
        try? tokenStore.clearSession()
    }

    func deleteAccount(session: AppSession) async throws {
        guard let url = URL(string: "/api/auth/delete", relativeTo: config.apiBaseURL) else {
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        
        let (data, response) = try await self.session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }
        
        guard http.statusCode >= 200, http.statusCode < 300 else {
            throw parseSupabaseError(from: data, statusCode: http.statusCode)
        }
        
        try? tokenStore.clearSession()
    }

    private func sendLogout(accessToken: String) async {
        guard let url = URL(string: "/api/auth/logout", relativeTo: config.apiBaseURL) else {
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        _ = try? await session.data(for: request)
    }

    private func parseSupabaseError(from data: Data, statusCode: Int) -> AuthError {
        if let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            if let message = parsed["error_description"] as? String {
                return .supabase(statusCode: statusCode, message: message)
            }
            if let message = parsed["msg"] as? String {
                return .supabase(statusCode: statusCode, message: message)
            }
            if let message = parsed["error"] as? String {
                return .supabase(statusCode: statusCode, message: message)
            }
        }
        return .supabase(statusCode: statusCode, message: "Authentication failed")
    }

    private func syncAppleProfileToSupabase(
        session: AppSession,
        fullName: String?,
        email: String?
    ) async throws {
        let trimmedName = fullName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedEmail = email?.trimmingCharacters(in: .whitespacesAndNewlines)
        let hasName = !(trimmedName ?? "").isEmpty
        let hasEmail = !(trimmedEmail ?? "").isEmpty
        guard hasName || hasEmail else {
            return
        }

        // Update auth metadata so future trigger/backfill pipelines can read canonical fields.
        if hasName {
            guard let authURL = URL(string: "/auth/v1/user", relativeTo: config.supabaseURL) else {
                throw AuthError.invalidSupabaseURL
            }
            var authRequest = URLRequest(url: authURL)
            authRequest.httpMethod = "PUT"
            authRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            authRequest.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
            authRequest.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            authRequest.httpBody = try JSONEncoder().encode([
                "data": [
                    "full_name": trimmedName ?? "",
                    "name": trimmedName ?? ""
                ]
            ])
            let (_, authResponse) = try await self.session.data(for: authRequest)
            if let http = authResponse as? HTTPURLResponse, !(200 ... 299).contains(http.statusCode) {
                throw AuthError.profileSyncFailed("Could not update auth metadata (\(http.statusCode)).")
            }
        }

        // Update public.users fields explicitly so dashboard/billing views stay in sync.
        guard
            let encodedID = session.user.id.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
            let usersURL = URL(string: "/rest/v1/users?id=eq.\(encodedID)", relativeTo: config.supabaseURL)
        else {
            throw AuthError.invalidSupabaseURL
        }

        var update: [String: String] = [:]
        if let trimmedName, !trimmedName.isEmpty {
            update["display_name"] = trimmedName
        }
        if let trimmedEmail, !trimmedEmail.isEmpty {
            update["email"] = trimmedEmail
        }
        guard !update.isEmpty else { return }

        var usersRequest = URLRequest(url: usersURL)
        usersRequest.httpMethod = "PATCH"
        usersRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        usersRequest.setValue(config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        usersRequest.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
        usersRequest.setValue("return=minimal", forHTTPHeaderField: "Prefer")
        usersRequest.httpBody = try JSONEncoder().encode(update)

        let (_, usersResponse) = try await self.session.data(for: usersRequest)
        if let http = usersResponse as? HTTPURLResponse, !(200 ... 299).contains(http.statusCode) {
            throw AuthError.profileSyncFailed("Could not update users profile (\(http.statusCode)).")
        }
    }
}

enum AuthError: LocalizedError {
    case invalidSupabaseURL
    case invalidResponse
    case supabase(statusCode: Int, message: String)
    case profileSyncFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidSupabaseURL:
            return "Supabase URL is invalid."
        case .invalidResponse:
            return "Authentication response was invalid."
        case let .supabase(statusCode, message):
            return "Sign-in failed (\(statusCode)): \(message)"
        case let .profileSyncFailed(message):
            return message
        }
    }
}
