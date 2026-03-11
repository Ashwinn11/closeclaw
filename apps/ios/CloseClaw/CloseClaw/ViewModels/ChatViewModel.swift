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

    var isConnected: Bool {
        if case .connected = gatewayClient.state { return true }
        return false
    }

    var gatewayState: GatewayWebSocketClient.ConnectionState {
        gatewayClient.state
    }

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
                // False means we keep trailing whitespace/newlines during stream
                let cleaned = cleanInboundText(text, trimTrailing: false)
                if !cleaned.isEmpty || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    streamingText = cleaned
                }
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
                    }.joined(separator: "\n")
                    return text.isEmpty ? nil : text
                }
            }
        }
        return value.stringValue
    }

    private func cleanInboundText(_ text: String, trimTrailing: Bool = true) -> String {
        let lines = text.components(separatedBy: .newlines)
        var result: [String] = []
        
        var inMetaBlock = false
        var inFence = false
        var hasEncounteredContent = false
        
        // Robust sentinel detection (matches Conversation info or Sender with variations)
        // Robust sentinel detection (matches Conversation info or Sender with variations)
        let sentinelRegex = try? NSRegularExpression(pattern: "(?:Conversation info|Sender) \\(untrusted metadata\\):", options: .caseInsensitive)
        // Timestamp detection (matches [2024-01-01 10:00:00 UTC] or similar)
        let tsRegex = try? NSRegularExpression(pattern: "^\\[\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}\\s+(?:UTC|GMT)\\]\\s*", options: .caseInsensitive)
        // System log detection (matches System: [Timestamp] or System: Exec...)
        let systemLogRegex = try? NSRegularExpression(pattern: "^System:\\s*(?:\\[.*?\\])?\\s*", options: .caseInsensitive)
        
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            
            // 1. GLOBAL STRIPPING: Metadata Blocks
            if !inMetaBlock {
                let range = NSRange(location: 0, length: trimmed.utf16.count)
                if sentinelRegex?.firstMatch(in: trimmed, options: [], range: range) != nil {
                    inMetaBlock = true
                    inFence = false
                    continue
                }
            } else {
                if !inFence && (trimmed == "```json" || trimmed == "```") {
                    inFence = true
                    continue
                }
                if inFence {
                    if trimmed == "```" {
                        inMetaBlock = false
                        inFence = false
                    }
                    continue
                }
                if trimmed.isEmpty { continue }
                inMetaBlock = false
            }
            
            // 2. HEADER-ONLY STRIPPING (Logs, Doctor Hints, Timestamps)
            // We strip leading logs until we hit the first line of real content.
            if !hasEncounteredContent {
                if trimmed.isEmpty { continue }
                
                let range = NSRange(location: 0, length: trimmed.utf16.count)
                
                // Skip System lines (regex handles variation in spacing/timestamp)
                if systemLogRegex?.firstMatch(in: trimmed, options: [], range: range) != nil {
                    continue
                }
                
                // Skip common internal Gateway instructions/hints
                if trimmed.hasPrefix("Run: openclaw doctor") || trimmed.hasPrefix("Actually, skip this") {
                    continue
                }
                
                // Skip standalone code fence clutter at the very top
                if trimmed == "json" || trimmed == "```" || trimmed == "```json" {
                    continue
                }
                
                // Skip message ID hints [message_id:...]
                if trimmed.hasPrefix("[message_id:") && trimmed.hasSuffix("]") {
                    continue
                }
                
                // Check if this line is JUST a timestamp at the top
                var lineAfterTS = line
                if let tsRegex = tsRegex {
                    lineAfterTS = tsRegex.stringByReplacingMatches(
                        in: line,
                        range: NSRange(location: 0, length: line.utf16.count),
                        withTemplate: ""
                    )
                }
                
                let contentRemaining = lineAfterTS.trimmingCharacters(in: .whitespacesAndNewlines)
                if contentRemaining.isEmpty {
                    // It was just a standalone timestamp line at the top
                    continue
                }
                
                // Special case: if the line starts with a timestamp but is followed by "Exec failed" or "Exec completed"
                // those are also system logs we want to strip from the header.
                if contentRemaining.hasPrefix("Exec failed") || contentRemaining.hasPrefix("Exec completed") || contentRemaining.hasPrefix("Gateway restart") {
                    continue
                }
                
                // If we got here, this is the first line of REAL content
                hasEncounteredContent = true
                
                // Even for the first content line, we strip the leading timestamp part if present
                if let tsRegex = tsRegex {
                    let processed = tsRegex.stringByReplacingMatches(
                        in: line,
                        range: NSRange(location: 0, length: line.utf16.count),
                        withTemplate: ""
                    )
                    if !processed.isEmpty {
                        result.append(processed)
                    }
                } else {
                    result.append(line)
                }
            } else {
                // 3. BODY CONTENT: Keep the text (including markdown for the renderer)
                // Only strip strictly internal directives.
                var processedLine = line
                processedLine = processedLine.replacingOccurrences(
                    of: "\\[\\[\\s*audio_as_voice\\s*\\]\\]",
                    with: "",
                    options: .regularExpression
                )
                
                result.append(processedLine)
            }
        }
        
        let output = result.joined(separator: "\n")
        
        if trimTrailing {
            return output.trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            return output.trimmingCharacters(in: .whitespaces)
        }
    }
}
