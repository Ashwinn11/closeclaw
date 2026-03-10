import Foundation

@MainActor
final class TasksViewModel: ObservableObject {
    @Published private(set) var jobs: [CronJob] = []
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let gatewayClient: GatewayWebSocketClient

    init(gatewayClient: GatewayWebSocketClient) {
        self.gatewayClient = gatewayClient
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        do {
            let payload = try await gatewayClient.rpc(method: "cron.list")
            jobs = parseJobs(payload)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func clear() {
        jobs = []
        isLoading = false
        errorMessage = nil
    }

    private func parseJobs(_ payload: JSONValue) -> [CronJob] {
        guard let root = payload.objectValue else {
            return []
        }
        guard let list = root["jobs"]?.arrayValue else {
            return []
        }

        var parsed: [CronJob] = []
        let decoder = JSONDecoder()
        for item in list {
            do {
                let raw = item.asAny
                guard JSONSerialization.isValidJSONObject(raw) else { continue }
                let data = try JSONSerialization.data(withJSONObject: raw)
                let job = try decoder.decode(CronJob.self, from: data)
                parsed.append(job)
            } catch {
                continue
            }
        }
        return parsed
    }
}
