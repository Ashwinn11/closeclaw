import Foundation

protocol APIClientProtocol {
    func getMe(accessToken: String) async throws -> UserProfile
    func getCredits(accessToken: String) async throws -> CreditsInfo
    func getMyInstance(accessToken: String) async throws -> InstanceInfo?
    func claimInstance(accessToken: String) async throws -> InstanceInfo
    func getGatewayProviderConfig(accessToken: String) async throws -> JSONValue
    func getCronJobs(accessToken: String) async throws -> [CronJob]
    func verifyPurchase(accessToken: String, signedTransaction: String) async throws
}



final class APIClient: APIClientProtocol {
    private let baseURL: URL
    private let session: URLSession
    private let decoder = JSONDecoder()

    init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    func getMe(accessToken: String) async throws -> UserProfile {
        try await request(
            path: "/api/auth/me",
            method: "GET",
            accessToken: accessToken,
            body: nil
        )
    }

    func getCredits(accessToken: String) async throws -> CreditsInfo {
        try await request(
            path: "/api/billing/credits",
            method: "GET",
            accessToken: accessToken,
            body: nil
        )
    }

    func getMyInstance(accessToken: String) async throws -> InstanceInfo? {
        try await requestAllowingNil(
            path: "/api/instances/mine",
            method: "GET",
            accessToken: accessToken,
            body: nil
        )
    }

    func claimInstance(accessToken: String) async throws -> InstanceInfo {
        try await request(
            path: "/api/instances/claim",
            method: "POST",
            accessToken: accessToken,
            body: nil
        )
    }

    func getGatewayProviderConfig(accessToken: String) async throws -> JSONValue {
        try await request(
            path: "/api/channels/gateway-config",
            method: "GET",
            accessToken: accessToken,
            body: nil
        )
    }

    func getCronJobs(accessToken: String) async throws -> [CronJob] {
        try await request(
            path: "/api/instances/mine/cron",
            method: "GET",
            accessToken: accessToken,
            body: nil
        )
    }

    func verifyPurchase(accessToken: String, signedTransaction: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["signedTransaction": signedTransaction])
        let _: JSONValue = try await request(
            path: "/api/billing/verify-ios",
            method: "POST",
            accessToken: accessToken,
            body: body
        )
    }

    private func request<T: Decodable>(
        path: String,
        method: String,
        accessToken: String,
        body: Data?
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL(path)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        let envelope: APIEnvelope<T>
        do {
            envelope = try decoder.decode(APIEnvelope<T>.self, from: data)
        } catch {
            throw APIError.decodingFailed(statusCode: http.statusCode)
        }

        guard http.statusCode >= 200, http.statusCode < 300 else {
            throw APIError.serverError(
                statusCode: http.statusCode,
                message: envelope.error ?? envelope.message ?? "Request failed"
            )
        }

        guard envelope.ok else {
            throw APIError.serverError(
                statusCode: http.statusCode,
                message: envelope.error ?? envelope.message ?? "Request failed"
            )
        }

        guard let payload = envelope.data else {
            throw APIError.missingPayload
        }

        return payload
    }

    private func requestAllowingNil<T: Decodable>(
        path: String,
        method: String,
        accessToken: String,
        body: Data?
    ) async throws -> T? {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError.invalidURL(path)
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.httpBody = body

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        let envelope: APIEnvelope<T>
        do {
            envelope = try decoder.decode(APIEnvelope<T>.self, from: data)
        } catch {
            throw APIError.decodingFailed(statusCode: http.statusCode)
        }

        guard http.statusCode >= 200, http.statusCode < 300 else {
            throw APIError.serverError(
                statusCode: http.statusCode,
                message: envelope.error ?? envelope.message ?? "Request failed"
            )
        }

        guard envelope.ok else {
            throw APIError.serverError(
                statusCode: http.statusCode,
                message: envelope.error ?? envelope.message ?? "Request failed"
            )
        }

        return envelope.data
    }
}

enum APIError: LocalizedError {
    case invalidURL(String)
    case invalidResponse
    case serverError(statusCode: Int, message: String)
    case decodingFailed(statusCode: Int)
    case missingPayload

    var errorDescription: String? {
        switch self {
        case let .invalidURL(path):
            return "Invalid API path: \(path)"
        case .invalidResponse:
            return "Unexpected API response."
        case let .serverError(statusCode, message):
            return "API error (\(statusCode)): \(message)"
        case let .decodingFailed(statusCode):
            return "Could not decode API response (\(statusCode))."
        case .missingPayload:
            return "API returned no payload."
        }
    }
}
