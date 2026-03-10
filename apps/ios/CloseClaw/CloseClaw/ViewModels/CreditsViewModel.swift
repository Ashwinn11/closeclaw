import Foundation

@MainActor
final class CreditsViewModel: ObservableObject {
    @Published private(set) var credits: CreditsInfo?
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let apiClient: APIClientProtocol

    init(apiClient: APIClientProtocol) {
        self.apiClient = apiClient
    }

    func load(accessToken: String) async {
        isLoading = true
        defer { isLoading = false }

        do {
            credits = try await apiClient.getCredits(accessToken: accessToken)
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func clear() {
        credits = nil
        isLoading = false
        errorMessage = nil
    }
}
