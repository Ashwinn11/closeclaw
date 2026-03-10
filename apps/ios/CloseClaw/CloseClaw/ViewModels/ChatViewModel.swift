import Foundation

@MainActor
final class ChatViewModel: ObservableObject {
    @Published private(set) var messages: [ChatMessage] = []
    @Published var composerText = ""
    @Published private(set) var streamingText: String?
    @Published private(set) var isLoadingHistory = false
    @Published private(set) var isSending = false
    @Published var errorMessage: String?

    private let gatewayClient: GatewayWebSocketClient
    private var eventToken: UUID?
    private var seenEventKeys = Set<String>()
    private var activeRunId: String?

    init(gatewayClient: GatewayWebSocketClient) {
        self.gatewayClient = gatewayClient
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

        Task { @MainActor in
            await loadHistory()
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
        isLoadingHistory = false
        isSending = false
        activeRunId = nil
        seenEventKeys.removeAll()
    }

    func loadHistory() async {
        isLoadingHistory = true
        defer { isLoadingHistory = false }

        do {
            let payload = try await gatewayClient.rpc(
                method: "chat.history",
                params: [
                    "sessionKey": .string("main"),
                    "limit": .number(200)
                ]
            )
            messages = parseHistory(payload)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func send() async {
        let text = composerText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        guard !isSending else { return }

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
            isSending = false
            activeRunId = nil
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
                streamingText = cleanInboundText(text)
            }
            return
        }

        if state == "final" || state == "aborted" || state == "error" {
            if let stream = streamingText, !stream.isEmpty {
                messages.append(
                    ChatMessage(
                        id: UUID(),
                        role: .assistant,
                        content: cleanInboundText(stream),
                        createdAt: Date()
                    )
                )
            } else if let message = payload["message"], let text = extractText(from: message), !text.isEmpty {
                messages.append(
                    ChatMessage(
                        id: UUID(),
                        role: .assistant,
                        content: cleanInboundText(text),
                        createdAt: Date()
                    )
                )
            } else if state == "error" {
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

            streamingText = nil
            isSending = false
            activeRunId = nil
            if runId != "-" {
                seenEventKeys = seenEventKeys.filter { !$0.hasPrefix("\(runId):") }
            }
        }
    }

    private func parseHistory(_ payload: JSONValue) -> [ChatMessage] {
        guard
            let root = payload.objectValue,
            let items = root["messages"]?.arrayValue
        else {
            return []
        }

        var parsed: [ChatMessage] = []
        for item in items {
            guard let object = item.objectValue else { continue }
            guard let roleRaw = object["role"]?.stringValue else { continue }
            guard roleRaw == "user" || roleRaw == "assistant" else { continue }
            guard let text = extractText(from: item), !text.isEmpty else { continue }

            let ts = object["timestamp"]?.doubleValue ?? Date().timeIntervalSince1970
            parsed.append(
                ChatMessage(
                    id: UUID(),
                    role: roleRaw == "user" ? .user : .assistant,
                    content: cleanInboundText(text),
                    createdAt: Date(timeIntervalSince1970: ts / (ts > 10_000_000_000 ? 1000 : 1))
                )
            )
        }
        return parsed
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
                        guard obj["type"]?.stringValue == "text" else { return nil }
                        return obj["text"]?.stringValue
                    }.joined()
                    return text.isEmpty ? nil : text
                }
            }
        }
        return value.stringValue
    }

    private func cleanInboundText(_ text: String) -> String {
        var output = text
        output = output.replacingOccurrences(
            of: "(?s)Conversation info \\(untrusted metadata\\):\\s*```json.*?```\\s*",
            with: "",
            options: .regularExpression
        )
        output = output.replacingOccurrences(
            of: "(?m)^\\s*\\[message_id:\\s*[^\\]]+\\]\\s*$",
            with: "",
            options: .regularExpression
        )
        output = output.replacingOccurrences(
            of: "\\[\\[\\s*audio_as_voice\\s*\\]\\]",
            with: "",
            options: .regularExpression
        )
        return output.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
