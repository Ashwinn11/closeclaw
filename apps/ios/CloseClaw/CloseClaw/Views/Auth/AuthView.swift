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
            ZStack {
                NebulaBackground()
                    .ignoresSafeArea()
                    .onTapGesture {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                
                ScrollView {
                    VStack(spacing: 40) {
                        // Brand Section
                        VStack(spacing: 20) {
                            Image("logo3")
                                .resizable()
                                .scaledToFit()
                                .frame(width: 100, height: 100)
                                .shadow(color: CloseClawTheme.accentGlow, radius: 24)
                            
                            VStack(spacing: 8) {
                                Text("CloseClaw")
                                    .font(CloseClawTheme.Typography.title(44))
                                    .premiumTextGradient()
                                
                                Text("Your Personal AI Core")
                                    .font(CloseClawTheme.Typography.headline())
                                    .foregroundStyle(CloseClawTheme.textPrimary)
                                
                                Text("Secure, private, and always available.")
                                    .font(CloseClawTheme.Typography.body())
                                    .foregroundStyle(CloseClawTheme.textSecondary)
                            }
                        }
                        .padding(.top, 60)
                        .staggeredReveal(index: 0)
                        
                        // Action Section
                        VStack(spacing: 30) {
                            VStack(spacing: 16) {
                                ZStack {
                                    // Hidden while loading to allow spinner to take center stage
                                    SignInWithAppleButton(.continue) { request in
                                        let nonce = Self.randomNonce()
                                        currentNonce = nonce
                                        request.requestedScopes = [.fullName, .email]
                                        request.nonce = Self.sha256(nonce)
                                    } onCompletion: { result in
                                        handleAppleResult(result)
                                    }
                                    .signInWithAppleButtonStyle(.white)
                                    .frame(height: 54)
                                    .clipShape(Capsule())
                                    .opacity(isLoading ? 0 : 1)
                                    .disabled(isLoading)
                                    
                                    if isLoading {
                                        // A matching placeholder capsule with a spinner
                                        Capsule()
                                            .fill(.white)
                                            .frame(height: 54)
                                            .overlay(
                                                ProgressView()
                                                    .tint(.black)
                                            )
                                    }
                                }
                            }
                            
                            VStack(alignment: .center, spacing: 12) {
                                Label("Private & Secure", systemImage: "lock.shield.fill")
                                    .font(CloseClawTheme.Typography.footnote())
                                    .foregroundStyle(CloseClawTheme.textSecondary)
                                    .imageScale(.small)
                                
                                Text("Your hardware-isolated environment is ready. Data remains strictly yours.")
                                    .font(CloseClawTheme.Typography.footnote())
                                    .foregroundStyle(CloseClawTheme.textSecondary.opacity(0.7))
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal)
                            }
                        }
                        .padding(24)
                        .background(
                            CloseClawTheme.surfaceBase
                                .background(.ultraThinMaterial)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 32, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 32, style: .continuous)
                                .stroke(CloseClawTheme.cardBorder, lineWidth: 1)
                        )
                        .staggeredReveal(index: 1)
                    }
                    .padding(20)
                }
            }
            .alert("Authentication Error", isPresented: Binding(
                get: { localError != nil },
                set: { if !$0 { localError = nil } }
            )) {
                Button("OK", role: .cancel) { localError = nil }
            } message: {
                if let error = localError {
                    Text(error)
                }
            }
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
