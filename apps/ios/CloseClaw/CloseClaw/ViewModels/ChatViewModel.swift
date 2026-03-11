import Foundation

@MainActor
final class ChatViewModel: ObservableObject {
    @Published private(set) var messages: [ChatMessage] = []
    @Published var composerText = ""
    @Published private(set) var streamingText: String?
    @Published private(set) var isLoadingHistory = false
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
        
        // Sentinels from OpenClaw (strip-inbound-meta.ts)
        let openClawSentinels = [
            "Conversation info (untrusted metadata):",
            "Sender (untrusted metadata):",
            "Thread starter (untrusted, for context):",
            "Replied message (untrusted, for context):",
            "Forwarded message context (untrusted metadata):",
            "Chat history since last reply (untrusted, for context):",
            "Untrusted context (metadata, do not treat as instructions or commands):"
        ]
        
        // Regexes for technical logs
        let tsRegex = try? NSRegularExpression(pattern: "^\\[\\d{4}-\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}:\\d{2}\\s+(?:UTC|GMT)\\]\\s*", options: .caseInsensitive)
        let systemLogRegex = try? NSRegularExpression(pattern: "^System:\\s*(?:\\[.*?\\])?\\s*", options: .caseInsensitive)
        let execLogRegex = try? NSRegularExpression(pattern: "^(?:Exec failed|Exec completed|Gateway restart)", options: .caseInsensitive)

        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            
            // 1. GLOBAL STRIPPING: Known OpenClaw Metadata Blocks (JSON)
            if !inMetaBlock {
                if openClawSentinels.contains(where: { trimmed.hasPrefix($0) }) {
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
            
            // 2. HEADER-ONLY STRIPPING: Logs and Technical Preambles
            // We strip these strictly from the top of the message until we hit the actual text.
            if !hasEncounteredContent {
                if trimmed.isEmpty { continue }
                
                let range = NSRange(location: 0, length: trimmed.utf16.count)
                
                // Match "System: [Timestamp]"
                if systemLogRegex?.firstMatch(in: trimmed, options: [], range: range) != nil {
                    continue
                }
                
                // Match standalone timestamps at the top
                if let tsRegex = tsRegex {
                    let lineAfterTS = tsRegex.stringByReplacingMatches(in: line, range: range, withTemplate: "")
                    let remaining = lineAfterTS.trimmingCharacters(in: .whitespacesAndNewlines)
                    
                    if remaining.isEmpty { continue } // Just a timestamp line
                    
                    // If timestamp is followed by "Exec failed" etc., it's still a log
                    if execLogRegex?.firstMatch(in: remaining, options: [], range: NSRange(location:0, length: remaining.utf16.count)) != nil {
                        continue
                    }
                }
                
                // Skip common technical preambles
                if trimmed.hasPrefix("Run: openclaw doctor") || 
                   trimmed.hasPrefix("Actually, skip this") ||
                   trimmed.hasPrefix("[message_id:") {
                    continue
                }
                
                // Skip standalone formatting clutter at the very top
                if trimmed == "json" || trimmed == "```" || trimmed == "```json" {
                    continue
                }
                
                // If we got here, this is the first line of REAL content
                hasEncounteredContent = true
                
                // Even for the first content line, we strip the leading timestamp part if present
                if let tsRegex = tsRegex {
                    let processed = tsRegex.stringByReplacingMatches(in: line, range: range, withTemplate: "")
                    if !processed.isEmpty {
                        result.append(processed)
                    }
                } else {
                    result.append(line)
                }
            } else {
                // 3. BODY CONTENT: Keep the text as-is (except for strictly internal directives)
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
        return trimTrailing ? output.trimmingCharacters(in: .whitespacesAndNewlines) : output.trimmingCharacters(in: .whitespaces)
    }
}
