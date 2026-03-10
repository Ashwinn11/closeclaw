import SwiftUI
import AuthenticationServices
import CryptoKit

struct AuthView: View {
    @State private var currentNonce = ""
    @State private var localError: String?

    let isLoading: Bool
    let onSignInWithApple: (_ idToken: String, _ nonce: String, _ fullName: String?, _ email: String?) async -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    VStack(spacing: 12) {
                        Image("BrandMark")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 82, height: 82)
                            .shadow(color: CloseClawTheme.accentGlow, radius: 18)
                        Text("CloseClaw")
                            .font(.system(size: 34, weight: .bold, design: .rounded))
                            .foregroundStyle(CloseClawTheme.textPrimary)
                        Text("Your own AI agent, now with native iOS sign-in")
                            .font(.subheadline)
                            .multilineTextAlignment(.center)
                            .foregroundStyle(CloseClawTheme.textSecondary)
                    }
                    .padding(.top, 20)

                    VStack(spacing: 14) {
                        SignInWithAppleButton(.continue) { request in
                            let nonce = Self.randomNonce()
                            currentNonce = nonce
                            request.requestedScopes = [.fullName, .email]
                            request.nonce = Self.sha256(nonce)
                        } onCompletion: { result in
                            handleAppleResult(result)
                        }
                        .signInWithAppleButtonStyle(.white)
                        .frame(height: 52)
                        .disabled(isLoading)

                        if isLoading {
                            ProgressView("Signing in...")
                                .foregroundStyle(CloseClawTheme.textSecondary)
                        }

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Uses your existing Supabase Apple OAuth setup.")
                            Text("Profile details are synced to Supabase user records.")
                        }
                        .font(.footnote)
                        .foregroundStyle(CloseClawTheme.textSecondary)
                        .frame(maxWidth: .infinity, alignment: .leading)

                        if let localError {
                            Text(localError)
                                .font(.footnote)
                                .foregroundStyle(CloseClawTheme.accentPrimary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    .closeClawGlassCard()
                }
                .padding(20)
            }
            .background(CloseClawTheme.bgRoot.ignoresSafeArea())
        }
    }

    private func handleAppleResult(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case let .failure(error):
            localError = error.localizedDescription
        case let .success(authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
                localError = "Apple credential is unavailable."
                return
            }
            guard let tokenData = credential.identityToken, let idToken = String(data: tokenData, encoding: .utf8) else {
                localError = "Could not read Apple identity token."
                return
            }
            guard !currentNonce.isEmpty else {
                localError = "Missing auth nonce."
                return
            }

            let displayName = credential.fullName.flatMap {
                let value = PersonNameComponentsFormatter().string(from: $0).trimmingCharacters(in: .whitespacesAndNewlines)
                return value.isEmpty ? nil : value
            }

            localError = nil
            Task {
                await onSignInWithApple(idToken, currentNonce, displayName, credential.email)
            }
        }
    }

    private static func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashed = SHA256.hash(data: inputData)
        return hashed.map { String(format: "%02x", $0) }.joined()
    }

    private static func randomNonce(length: Int = 32) -> String {
        let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        var remaining = length

        while remaining > 0 {
            var randomBytes = [UInt8](repeating: 0, count: 16)
            let status = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
            if status != errSecSuccess {
                fatalError("Unable to generate nonce: \(status)")
            }

            randomBytes.forEach { byte in
                if remaining == 0 {
                    return
                }
                if byte < characters.count {
                    result.append(characters[Int(byte)])
                    remaining -= 1
                }
            }
        }
        return result
    }
}

#Preview {
    AuthView(isLoading: false, onSignInWithApple: { _, _, _, _ in })
}
