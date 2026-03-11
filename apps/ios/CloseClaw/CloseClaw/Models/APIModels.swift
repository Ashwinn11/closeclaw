import Foundation

struct APIEnvelope<T: Decodable>: Decodable {
    let ok: Bool
    let data: T?
    let error: String?
    let message: String?
}

struct UserProfile: Codable, Equatable {
    let id: String
    let email: String
}

struct CreditsInfo: Decodable, Equatable {
    let api_credits: Double
    let plan: String
    let subscription_renews_at: String?
}

struct InstanceInfo: Decodable, Equatable {
    let id: String
    let user_id: String
    let status: String
    let internal_ip: String?
    let gateway_port: Int?
    let claimed_at: String?
}

struct CronJob: Decodable, Identifiable, Equatable {
    let id: String
    let name: String?
    let cron: String?
    let prompt: String?
    let enabled: Bool?
    let nextWakeAtMs: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case cron
        case prompt
        case enabled
        case nextWakeAtMs
    }
}

struct ChatMessage: Identifiable, Equatable {
    let id: UUID
    let role: Role
    let content: String
    let createdAt: Date

    enum Role: String {
        case user
        case assistant
        case system
    }
}

struct AppSession: Codable, Equatable {
    let accessToken: String
    let refreshToken: String
    let tokenType: String
    let expiresAt: Date
    let user: UserProfile

    var isExpired: Bool {
        // Return true if the token expires in less than 10 minutes to allow proactive refresh
        Date().addingTimeInterval(600) >= expiresAt
    }
}

struct SupabaseSessionResponse: Decodable {
    let access_token: String
    let refresh_token: String
    let token_type: String
    let expires_in: Double
    let user: SupabaseUser
}

struct SupabaseUser: Decodable {
    let id: String
    let email: String?
}
