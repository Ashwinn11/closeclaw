import Foundation

struct GatewayEvent {
    let name: String
    let payload: JSONValue?
}

@MainActor
final class GatewayWebSocketClient: ObservableObject {
    enum ConnectionState: Equatable {
        case disconnected
        case connecting
        case connected
        case failed(String)
    }

    @Published private(set) var state: ConnectionState = .disconnected

    private let apiBaseURL: URL
    private let session: URLSession
    private var socketTask: URLSessionWebSocketTask?
    private var receiveTask: Task<Void, Never>?
    private var connectTimeoutTask: Task<Void, Never>?
    private var connectContinuation: CheckedContinuation<Void, Error>?
    private var accessToken: String?
    private var reconnectTask: Task<Void, Never>?
    private var heartbeatTask: Task<Void, Never>?
    private var reconnectAttempts = 0
    private var isExplicitlyDisconnected = false
    private var pendingRPCs: [String: PendingRPC] = [:]
    private var eventHandlers: [UUID: (GatewayEvent) -> Void] = [:]
    private var sequence = 0
    private var isReady = false

    init(apiBaseURL: URL, session: URLSession = .shared) {
        self.apiBaseURL = apiBaseURL
        self.session = session
    }

    func connect(accessToken: String) async throws {
        self.accessToken = accessToken
        isExplicitlyDisconnected = false
        reconnectAttempts = 0
        reconnectTask?.cancel()
        reconnectTask = nil

        try await connectInternal()
    }

    private func connectInternal() async throws {
        guard let accessToken = self.accessToken else {
            throw GatewayError.notConnected
        }

        if case .connected = state {
            return
        }
        if case .connecting = state {
            // If already connecting, we might want to wait for the existing one.
            // But for simplicity, we'll let the current continuation handle it.
            return
        }

        let wsURL = try makeWebSocketURL(accessToken: accessToken)
        state = .connecting
        isReady = false

        let task = session.webSocketTask(with: wsURL)
        socketTask = task
        task.resume()
        startReceiveLoop(for: task)

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connectContinuation = continuation

            connectTimeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                await self?.finishConnect(with: .failure(GatewayError.connectionTimeout))
            }
        }
    }

    func disconnect() {
        isExplicitlyDisconnected = true
        stopHeartbeat()
        reconnectTask?.cancel()
        reconnectTask = nil
        
        connectTimeoutTask?.cancel()
        connectTimeoutTask = nil
        connectContinuation = nil
        failAllPending(with: GatewayError.connectionClosed)

        receiveTask?.cancel()
        receiveTask = nil

        socketTask?.cancel(with: .goingAway, reason: nil)
        socketTask = nil
        isReady = false
        state = .disconnected
    }

    func rpc(method: String, params: [String: JSONValue] = [:]) async throws -> JSONValue {
        // Use a local copy to avoid capturing self too strongly or race conditions if task changes
        guard isReady, let task = socketTask else {
            throw GatewayError.notConnected
        }

        sequence += 1
        let id = "rpc-\(sequence)"
        let frame: [String: Any] = [
            "type": "req",
            "id": id,
            "method": method,
            "params": params.mapValues(\.asAny)
        ]

        return try await withCheckedThrowingContinuation { continuation in
            let timeoutTask = Task { [weak self] in
                try? await Task.sleep(nanoseconds: 15_000_000_000)
                await self?.timeoutRPC(id: id)
            }
            pendingRPCs[id] = PendingRPC(continuation: continuation, timeoutTask: timeoutTask)

            Task { [weak self] in
                do {
                    let data = try JSONSerialization.data(withJSONObject: frame)
                    try await task.send(.data(data))
                } catch {
                    await self?.failRPC(id: id, error: error)
                }
            }
        }
    }

    func subscribe(_ handler: @escaping (GatewayEvent) -> Void) -> UUID {
        let token = UUID()
        eventHandlers[token] = handler
        return token
    }

    func unsubscribe(_ token: UUID) {
        eventHandlers.removeValue(forKey: token)
    }

    private func startReceiveLoop(for task: URLSessionWebSocketTask) {
        receiveTask?.cancel()
        receiveTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                do {
                    let message = try await task.receive()
                    await self.handleWebSocketMessage(message)
                } catch {
                    await self.handleDisconnect(error: error)
                    return
                }
            }
        }
    }

    private func handleWebSocketMessage(_ message: URLSessionWebSocketTask.Message) async {
        let data: Data
        switch message {
        case let .data(raw):
            data = raw
        case let .string(text):
            data = Data(text.utf8)
        @unknown default:
            return
        }

        guard
            let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let type = object["type"] as? String
        else {
            return
        }

        if type == "proxy-ready" {
            await finishConnect(with: .success(()))
            return
        }

        if type == "res", let id = object["id"] as? String {
            guard let pending = pendingRPCs.removeValue(forKey: id) else {
                return
            }
            pending.timeoutTask.cancel()

            let ok = object["ok"] as? Bool ?? false
            if ok {
                pending.continuation.resume(returning: JSONValue.from(any: object["payload"] ?? NSNull()))
            } else {
                let message = (object["error"] as? [String: Any])?["message"] as? String ?? "RPC failed"
                pending.continuation.resume(throwing: GatewayError.rpcFailed(message))
            }
            return
        }

        if type == "event" {
            let event = object["event"] as? String ?? "unknown"
            let payload = object["payload"].map(JSONValue.from(any:))
            let eventValue = GatewayEvent(name: event, payload: payload)
            for handler in eventHandlers.values {
                handler(eventValue)
            }

            if event == "proxy.disconnected" {
                await handleDisconnect(error: GatewayError.connectionClosed)
            }
        }
    }

    private func handleDisconnect(error: Error) async {
        stopHeartbeat()
        connectTimeoutTask?.cancel()
        connectTimeoutTask = nil
        if let continuation = connectContinuation {
            continuation.resume(throwing: error)
            connectContinuation = nil
        }
        failAllPending(with: error)

        receiveTask?.cancel()
        receiveTask = nil
        socketTask = nil
        isReady = false
        
        if isExplicitlyDisconnected {
            state = .disconnected
        } else {
            state = .failed(error.localizedDescription)
            scheduleReconnect()
        }
    }

    private func scheduleReconnect() {
        reconnectTask?.cancel()
        
        let attempts = reconnectAttempts
        reconnectAttempts += 1
        
        // Exponential backoff: min(1s * 2^attempts, 30s)
        let delaySeconds = min(pow(2.0, Double(attempts)), 30.0)
        let nanoseconds = UInt64(delaySeconds * 1_000_000_000)
        
        reconnectTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: nanoseconds)
            guard let self, !Task.isCancelled else { return }
            do {
                try await self.connectInternal()
            } catch {
                // Reconnect failed, handleDisconnect will be called again by connectInternal failure
                // or startReceiveLoop failure, triggering another scheduleReconnect.
                print("[Gateway] Reconnect attempt \(attempts) failed: \(error)")
            }
        }
    }

    private func finishConnect(with result: Result<Void, Error>) async {
        guard let continuation = connectContinuation else {
            return
        }
        connectContinuation = nil
        connectTimeoutTask?.cancel()
        connectTimeoutTask = nil

        switch result {
        case .success:
            isReady = true
            state = .connected
            reconnectAttempts = 0
            startHeartbeat()
            continuation.resume()
        case let .failure(error):
            isReady = false
            state = .failed(error.localizedDescription)
            continuation.resume(throwing: error)
            socketTask?.cancel(with: .goingAway, reason: nil)
            socketTask = nil
            
            if !isExplicitlyDisconnected {
                scheduleReconnect()
            }
        }
    }

    private func startHeartbeat() {
        stopHeartbeat()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000) // 30s
                guard let self, self.isReady else { break }
                
                do {
                    _ = try await self.rpc(method: "health")
                } catch {
                    print("[Gateway] Heartbeat failed: \(error)")
                    // RPC failure usually means connection is dead. 
                    // handleDisconnect should ideally be triggered by URLSession, 
                    // but we can force it here if needed.
                }
            }
        }
    }

    private func stopHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
    }

    private func timeoutRPC(id: String) async {
        guard let pending = pendingRPCs.removeValue(forKey: id) else {
            return
        }
        pending.continuation.resume(throwing: GatewayError.rpcTimeout)
    }

    private func failRPC(id: String, error: Error) async {
        guard let pending = pendingRPCs.removeValue(forKey: id) else {
            return
        }
        pending.timeoutTask.cancel()
        pending.continuation.resume(throwing: error)
    }

    private func failAllPending(with error: Error) {
        for (_, pending) in pendingRPCs {
            pending.timeoutTask.cancel()
            pending.continuation.resume(throwing: error)
        }
        pendingRPCs.removeAll()
    }

    private func makeWebSocketURL(accessToken: String) throws -> URL {
        guard var components = URLComponents(url: apiBaseURL, resolvingAgainstBaseURL: false) else {
            throw GatewayError.invalidURL
        }
        components.scheme = (components.scheme == "https") ? "wss" : "ws"
        var path = components.path
        if path.hasSuffix("/") {
            path.removeLast()
        }
        components.path = path + "/ws"
        components.queryItems = [URLQueryItem(name: "token", value: accessToken)]
        guard let url = components.url else {
            throw GatewayError.invalidURL
        }
        return url
    }

    private struct PendingRPC {
        let continuation: CheckedContinuation<JSONValue, Error>
        let timeoutTask: Task<Void, Never>
    }
}

enum GatewayError: LocalizedError {
    case invalidURL
    case notConnected
    case connectionTimeout
    case connectionClosed
    case rpcTimeout
    case rpcFailed(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "WebSocket URL is invalid."
        case .notConnected:
            return "Gateway is not connected."
        case .connectionTimeout:
            return "Gateway connection timed out."
        case .connectionClosed:
            return "Gateway connection closed."
        case .rpcTimeout:
            return "Gateway request timed out."
        case let .rpcFailed(message):
            return "Gateway RPC failed: \(message)"
        }
    }
}
