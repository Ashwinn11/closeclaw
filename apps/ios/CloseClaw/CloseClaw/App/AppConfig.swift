import Foundation

struct AppConfig {
    let apiBaseURL: URL
    let supabaseURL: URL
    let supabaseAnonKey: String

    static func load() throws -> AppConfig {
        let info = Bundle.main.infoDictionary ?? [:]

        let apiBase = (info["CLOSECLAW_API_BASE_URL"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? "http://localhost:3001"
        let supabaseBase = (info["CLOSECLAW_SUPABASE_URL"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? ""
        let supabaseKey = (info["CLOSECLAW_SUPABASE_ANON_KEY"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            ?? ""

        guard let apiBaseURL = URL(string: apiBase) else {
            throw AppConfigError.invalidURL("CLOSECLAW_API_BASE_URL")
        }
        guard let supabaseURL = URL(string: supabaseBase), !supabaseBase.isEmpty else {
            throw AppConfigError.invalidURL("CLOSECLAW_SUPABASE_URL")
        }
        guard !supabaseKey.isEmpty else {
            throw AppConfigError.missingValue("CLOSECLAW_SUPABASE_ANON_KEY")
        }

        return AppConfig(
            apiBaseURL: apiBaseURL,
            supabaseURL: supabaseURL,
            supabaseAnonKey: supabaseKey
        )
    }
}

enum AppConfigError: LocalizedError {
    case invalidURL(String)
    case missingValue(String)

    var errorDescription: String? {
        switch self {
        case let .invalidURL(key):
            return "Invalid config URL for \(key)."
        case let .missingValue(key):
            return "Missing config value for \(key)."
        }
    }
}
