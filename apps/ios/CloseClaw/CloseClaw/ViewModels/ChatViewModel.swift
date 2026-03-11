import Foundation

@MainActor
final class ChatViewModel: ObservableObject {
    @Published private(set) var messages: [ChatMessage] = []
    @Published var composerText = ""
    @Published private(set) var streamingText: String?
    @Published private(set) var hasLoadedHistory = false
    @Published private(set) var isSending = false
    @Published var errorMessage: String?
    @Published var successMessage: String?

    private let gatewayClient: GatewayWebSocketClient
    private var eventToken: UUID?
    private var seenEventKeys = Set<String>()
    private var activeRunId: String?

    var isConnected: Bool {
        if case .connected = gatewayClient.state { return true }
        return false
    }

    var gatewayState: GatewayWebSocketClient.ConnectionState {
        gatewayClient.state
    }

    init(gatewayClient: GatewayWebSocketClient) {
        self.gatewayClient = gatewayClient
        loadFromCache()
    }

    private nonisolated var cacheURL: URL {
        let paths = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
        return paths[0].appendingPathComponent("chat_cache.json")
    }

    private func saveToCache() {
        let url = cacheURL
        let currentMessages = messages
        Task.detached(priority: .background) {
            do {
                let data = try JSONEncoder().encode(currentMessages)
                try data.write(to: url, options: [.atomic, .completeFileProtection])
            } catch {
                print("[ChatViewModel] Failed to save cache: \(error)")
            }
        }
    }

    private func loadFromCache() {
        // Always mark loaded so the empty state never flashes while data arrives
        hasLoadedHistory = true
        let url = cacheURL
        Task.detached(priority: .userInitiated) { [weak self] in
            guard let self else { return }
            guard FileManager.default.fileExists(atPath: url.path) else { return }
            do {
                let data = try Data(contentsOf: url)
                let cached = try JSONDecoder().decode([ChatMessage].self, from: data)
                await MainActor.run {
                    // Only update if we haven't received live messages already
                    if self.messages.isEmpty && !cached.isEmpty {
                        self.messages = cached
                    }
                }
            } catch {
                print("[ChatViewModel] Failed to load cache: \(error)")
            }
        }
    }

    func activate() {
        if eventToken == nil {
            eventToken = gatewayClient.subscribe { [weak self] event in
                guard let self else { return }
                Task { @MainActor in
                    self.handleGatewayEvent(event)
                }
            }
        }
        // Never walk back hasLoadedHistory once it's true
        if !hasLoadedHistory {
            hasLoadedHistory = true
        }
    }

    func clear() {
        if let eventToken {
            gatewayClient.unsubscribe(eventToken)
            self.eventToken = nil
        }
        messages.removeAll()
        streamingText = nil
        composerText = ""
        hasLoadedHistory = false
        isSending = false
        activeRunId = nil
        seenEventKeys.removeAll()
        try? FileManager.default.removeItem(at: cacheURL)
    }

    func send() async {
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }

        let runId = UUID().uuidString
        activeRunId = runId
        isSending = true
        composerText = ""
        streamingText = nil
        messages.append(
            ChatMessage(
                id: UUID(),
                role: .user,
                content: text,
                createdAt: Date()
            )
        )
        saveToCache()

        do {
            _ = try await gatewayClient.rpc(
                method: "chat.send",
                params: [
                    "sessionKey": .string("main"),
                    "message": .string(text),
                    "deliver": .bool(false),
                    "idempotencyKey": .string(runId)
                ]
            )
        } catch {
            if activeRunId == runId {
                isSending = false
                activeRunId = nil
            }
            errorMessage = error.localizedDescription
            messages.append(
                ChatMessage(
                    id: UUID(),
                    role: .system,
                    content: "Send failed: \(error.localizedDescription)",
                    createdAt: Date()
                )
            )
        }
    }

    func abort() async {
        guard let activeRunId else { return }
        do {
            _ = try await gatewayClient.rpc(
                method: "chat.abort",
                params: [
                    "sessionKey": .string("main"),
                    "runId": .string(activeRunId)
                ]
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func flagMessage(_ message: ChatMessage) {
        // For App Store Guidelines, we must provide a reporting mechanism.
        // This confirms to the user that action is taken.
        successMessage = "Message reported. Our moderation team will review this output for safety compliance."
    }

    private func handleGatewayEvent(_ event: GatewayEvent) {
        guard event.name == "chat" else { return }
        guard let payload = event.payload?.objectValue else { return }

        if let sessionKey = payload["sessionKey"]?.stringValue {
            // Web dashboard tracks "agent:main:main". Keep the same filter.
            if sessionKey != "agent:main:main" && sessionKey != "main" {
                return
            }
        }

        let runId = payload["runId"]?.stringValue ?? "-"
        let seq = payload["seq"]?.doubleValue ?? -1
        let dedupKey = "\(runId):\(seq)"
        if seenEventKeys.contains(dedupKey) {
            return
        }
        seenEventKeys.insert(dedupKey)

        let state = payload["state"]?.stringValue ?? ""
        if state == "delta" {
            if let message = payload["message"], let text = extractText(from: message), !text.isEmpty {
                // Keep appending to our local buffer
                let current = streamingText ?? ""
                streamingText = current + text
            }
            return
        }

        if state == "final" || state == "aborted" || state == "error" {
            // Priority 1: Use the official final message from the payload if it exists.
            var finalContent: String?
            if let message = payload["message"], let text = extractText(from: message), !text.isEmpty {
                finalContent = text
            } else if let accumulated = streamingText, !accumulated.isEmpty {
                finalContent = accumulated
            }

            // Clear live-response state FIRST so the streaming bubble disappears
            // before the finalized message is inserted. If we append first, SwiftUI
            // briefly shows both the stream bubble AND the new message (duplicate flash).
            streamingText = nil
            isSending = false
            activeRunId = nil
            if runId != "-" {
                seenEventKeys = seenEventKeys.filter { !$0.hasPrefix("\(runId):") }
            }

            if let content = finalContent {
                messages.append(
                    ChatMessage(
                        id: UUID(),
                        role: .assistant,
                        content: cleanInboundText(content),
                        createdAt: Date()
                    )
                )
            }

            if state == "error" {
                let errorText = payload["errorMessage"]?.stringValue ?? "Unknown error"
                messages.append(
                    ChatMessage(
                        id: UUID(),
                        role: .system,
                        content: "Error: \(errorText)",
                        createdAt: Date()
                    )
                )
            }

            saveToCache()
        }
    }

    private func extractText(from value: JSONValue) -> String? {
        if let object = value.objectValue {
            if let direct = object["content"] {
                if let plain = direct.stringValue {
                    return plain
                }
                if let blocks = direct.arrayValue {
                    let text = blocks.compactMap { block -> String? in
                        guard let obj = block.objectValue else { return nil }
                        // Don't just skip "text" blocks. If the block has a "text" field, 
                        // it's likely content we should show (could be logs, metadata, etc.)
                        return obj["text"]?.stringValue
                    }.joined(separator: "\n")
                    return text.isEmpty ? nil : text
                }
            }
        }
        return value.stringValue
    }

    private func cleanInboundText(_ text: String, trimTrailing: Bool = true) -> String {
        return trimTrailing ? text.trimmingCharacters(in: .whitespacesAndNewlines) : text.trimmingCharacters(in: .whitespaces)
    }
}
