import Foundation
import Security

protocol TokenStore {
    func save(session: AppSession) throws
    func loadSession() throws -> AppSession?
    func clearSession() throws
}

final class KeychainTokenStore: TokenStore {
    private let service = "in.closeclaw.ios"
    private let account = "auth.session"
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    func save(session: AppSession) throws {
        let data = try encoder.encode(session)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]

        let attributes: [String: Any] = [
            kSecValueData as String: data
        ]

        let status: OSStatus
        if SecItemCopyMatching(query as CFDictionary, nil) == errSecSuccess {
            status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        } else {
            var create = query
            create[kSecValueData as String] = data
            status = SecItemAdd(create as CFDictionary, nil)
        }

        guard status == errSecSuccess else {
            throw TokenStoreError.keychainWriteFailed(status)
        }
    }

    func loadSession() throws -> AppSession? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            return nil
        }
        guard status == errSecSuccess else {
            throw TokenStoreError.keychainReadFailed(status)
        }
        guard let data = result as? Data else {
            throw TokenStoreError.invalidPayload
        }
        return try decoder.decode(AppSession.self, from: data)
    }

    func clearSession() throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess, status != errSecItemNotFound {
            throw TokenStoreError.keychainDeleteFailed(status)
        }
    }
}

enum TokenStoreError: LocalizedError {
    case keychainWriteFailed(OSStatus)
    case keychainReadFailed(OSStatus)
    case keychainDeleteFailed(OSStatus)
    case invalidPayload

    var errorDescription: String? {
        switch self {
        case let .keychainWriteFailed(code):
            return "Could not write auth session to keychain (\(code))."
        case let .keychainReadFailed(code):
            return "Could not read auth session from keychain (\(code))."
        case let .keychainDeleteFailed(code):
            return "Could not delete auth session from keychain (\(code))."
        case .invalidPayload:
            return "Stored auth payload is invalid."
        }
    }
}
