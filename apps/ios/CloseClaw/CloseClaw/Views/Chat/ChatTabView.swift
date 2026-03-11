import SwiftUI

struct ChatTabView: View {
    @ObservedObject var viewModel: ChatViewModel
    let onReload: () -> Void
    let onShowSettings: () -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                NebulaBackground()
                    .ignoresSafeArea()
                    .onTapGesture {
                        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
                    }
                
                VStack(spacing: 0) {
                    if viewModel.isLoadingHistory {
                        VStack(spacing: 12) {
                            ProgressView()
                                .tint(CloseClawTheme.accentPrimary)
                            Text("Retrieving your encrypted history...")
                                .font(CloseClawTheme.Typography.subtitle())
                                .foregroundStyle(CloseClawTheme.textPrimary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                    } else if viewModel.messages.isEmpty && (viewModel.streamingText ?? "").isEmpty && !viewModel.isSending {
                        VStack(spacing: 16) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 48))
                                .foregroundStyle(CloseClawTheme.accentSecondary)
                                .shadow(color: CloseClawTheme.accentSecondaryGlow, radius: 15)
                            
                            Text("Your AI Core is Ready")
                                .font(CloseClawTheme.Typography.headline())
                            
                            Text("Start a conversation to see it in action.")
                                .font(CloseClawTheme.Typography.body())
                                .foregroundStyle(CloseClawTheme.textSecondary)
                                .multilineTextAlignment(.center)
                        }
                        .padding(.horizontal, 40)
                        .frame(maxHeight: .infinity)
                        .staggeredReveal(index: 0)
                    } else {
                        ScrollViewReader { proxy in
                            ScrollView {
                                LazyVStack(spacing: 20) {
                                    ForEach(Array(viewModel.messages.enumerated()), id: \.element.id) { index, message in
                                        MessageBubble(message: message)
                                            .id(message.id)
                                    }
                                    
                                    if viewModel.isSending && (viewModel.streamingText ?? "").isEmpty {
                                        ThinkingIndicator()
                                            .frame(maxWidth: .infinity, alignment: .leading)
                                            .id("thinking")
                                    }
                                    
                                    if let stream = viewModel.streamingText, !stream.isEmpty {
                                        MessageBubble(
                                            message: ChatMessage(
                                                id: UUID(),
                                                role: .assistant,
                                                content: stream,
                                                createdAt: Date()
                                            ),
                                            isStreaming: true
                                        )
                                        .id("streaming")
                                    }
                                }
                                .padding(.vertical, 12)
                            }
                            .scrollDismissesKeyboard(.interactively)
                            .onChange(of: viewModel.messages.count) {
                                scrollToBottom(with: proxy)
                            }
                            .onChange(of: viewModel.streamingText) {
                                scrollToBottom(with: proxy, animated: false)
                            }
                            .onChange(of: viewModel.isLoadingHistory) { _, loading in
                                if !loading {
                                    scrollToBottom(with: proxy, animated: false)
                                }
                            }
                            .onAppear {
                                scrollToBottom(with: proxy, animated: false)
                            }
                        }
                    }
                    
                    inputBar
                }
            }
            .navigationTitle("AI Core")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        onReload()
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(CloseClawTheme.textSecondary)
                    }
                }
                
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        onShowSettings()
                    } label: {
                        Image(systemName: "gearshape")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(CloseClawTheme.textSecondary)
                    }
                }
            }
            .alert("AI Core Error", isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )) {
                Button("OK", role: .cancel) { viewModel.errorMessage = nil }
            } message: {
                if let error = viewModel.errorMessage {
                    Text(error)
                }
            }
        }
    }

    private func scrollToBottom(with proxy: ScrollViewProxy, animated: Bool = true) {
        Task { @MainActor in
            // Tiny delay to allow SwiftUI layout to settle
            try? await Task.sleep(nanoseconds: 50_000_000)
            
            let action = {
                if viewModel.streamingText != nil {
                    proxy.scrollTo("streaming", anchor: .bottom)
                } else if viewModel.isSending {
                    proxy.scrollTo("thinking", anchor: .bottom)
                } else if let last = viewModel.messages.last {
                    proxy.scrollTo(last.id, anchor: .bottom)
                }
            }
            
            if animated {
                withAnimation(.easeOut(duration: 0.2), action)
            } else {
                action()
            }
        }
    }

    private var inputBar: some View {
        VStack(spacing: 0) {
            if !viewModel.isConnected {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text("Reconnecting to core...")
                        .font(CloseClawTheme.Typography.footnote())
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 6)
                .background(CloseClawTheme.accentSecondary.opacity(0.1))
                .foregroundStyle(CloseClawTheme.accentSecondary)
            }

            Divider()
                .overlay(CloseClawTheme.cardBorder.opacity(0.5))
            
            HStack(alignment: .bottom, spacing: 12) {
                HStack(alignment: .bottom, spacing: 10) {
                    TextField("Ask CloseClaw anything...", text: $viewModel.composerText, axis: .vertical)
                        .lineLimit(1 ... 8)
                        .font(CloseClawTheme.Typography.body())
                        .foregroundStyle(CloseClawTheme.textPrimary)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 12)
                }
                .background(
                    Capsule()
                        .fill(CloseClawTheme.surfaceBase)
                        .overlay(
                            Capsule()
                                .stroke(CloseClawTheme.cardBorder, lineWidth: 1)
                        )
                )
                
                Button {
                    Task {
                        await viewModel.send()
                    }
                } label: {
                    Image(systemName: "arrow.up")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(
                            (viewModel.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !viewModel.isConnected)
                            ? CloseClawTheme.surfaceHover 
                            : CloseClawTheme.accentPrimary
                        )
                        .clipShape(Circle())
                        .shadow(color: (viewModel.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !viewModel.isConnected) ? .clear : CloseClawTheme.accentGlow, radius: 10)
                }
                .disabled(viewModel.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !viewModel.isConnected)
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 8)
            .background(
                VisualEffectBlur(blurStyle: .systemUltraThinMaterialDark)
                    .ignoresSafeArea(edges: .bottom)
            )
        }
    }
}

private struct MessageBubble: View {
    let message: ChatMessage
    var isStreaming = false

    var body: some View {
        HStack(alignment: .bottom, spacing: 0) {
            if message.role == .user { Spacer(minLength: 60) }
            
            VStack(alignment: .trailing, spacing: 2) {
                MarkdownMessageView(content: message.content, role: message.role)
                
                Text(message.createdAt, style: .time)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(foreground.opacity(0.6))
                    .padding(.top, 2)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(background)
            .clipShape(ChatBubbleShape(isUser: message.role == .user))
            .shadow(color: .black.opacity(0.05), radius: 2, y: 1)
            
            if message.role != .user { Spacer(minLength: 60) }
        }
        .padding(.horizontal, 12)
    }
    
    private var background: Color {
        switch message.role {
        case .user:
            return CloseClawTheme.accentPrimary
        case .assistant:
            return CloseClawTheme.surfaceBase
        case .system:
            return CloseClawTheme.accentSecondary.opacity(0.1)
        }
    }

    private var foreground: Color {
        message.role == .user ? .white : CloseClawTheme.textPrimary
    }
}

struct ChatBubbleShape: Shape {
    let isUser: Bool
    
    func path(in rect: CGRect) -> Path {
        let path = UIBezierPath(
            roundedRect: rect,
            byRoundingCorners: [
                .topLeft,
                .topRight,
                isUser ? .bottomLeft : .bottomRight
            ],
            cornerRadii: CGSize(width: 18, height: 18)
        )
        return Path(path.cgPath)
    }
}

private struct ThinkingIndicator: View {
    @State private var dotScale: CGFloat = 0.5
    
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(CloseClawTheme.textSecondary)
                    .frame(width: 6, height: 6)
                    .scaleEffect(dotScale)
                    .animation(
                        .easeInOut(duration: 0.6)
                        .repeatForever()
                        .delay(Double(index) * 0.2),
                        value: dotScale
                    )
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(CloseClawTheme.surfaceBase)
        .clipShape(Capsule())
        .onAppear {
            dotScale = 1.0
        }
    }
}

// MARK: - Markdown Renderer

struct MarkdownMessageView: View {
    let content: String
    let role: ChatMessage.Role
    
    var body: some View {
        let segments = parseSegments(content)
        
        VStack(alignment: .leading, spacing: 12) {
            ForEach(0..<segments.count, id: \.self) { index in
                let segment = segments[index]
                if segment.isCode {
                    codeBlock(segment.text)
                } else {
                    richTextLines(segment.text)
                }
            }
        }
        .textSelection(.enabled)
    }
    
    @ViewBuilder
    private func richTextLines(_ text: String) -> some View {
        let lines = text.components(separatedBy: .newlines)
        VStack(alignment: .leading, spacing: 6) {
            ForEach(0..<lines.count, id: \.self) { i in
                let line = lines[i]
                let trimmed = line.trimmingCharacters(in: .whitespaces)
                
                if trimmed.isEmpty {
                    Color.clear.frame(height: 2)
                } else if trimmed.hasPrefix("### ") {
                    Text(trimmed.replacingOccurrences(of: "### ", with: ""))
                        .font(.system(size: 18, weight: .bold))
                        .padding(.top, 4)
                        .foregroundStyle(role == .user ? .white : CloseClawTheme.accentPrimary)
                } else if trimmed.hasPrefix("## ") {
                    Text(trimmed.replacingOccurrences(of: "## ", with: ""))
                        .font(.system(size: 20, weight: .bold))
                        .padding(.top, 6)
                        .foregroundStyle(role == .user ? .white : CloseClawTheme.accentPrimary)
                } else if trimmed.hasPrefix("* ") || trimmed.hasPrefix("- ") {
                    HStack(alignment: .top, spacing: 8) {
                        Text("•")
                            .font(.system(size: 16, weight: .black))
                            .foregroundStyle(CloseClawTheme.accentSecondary)
                        Text(LocalizedStringKey(trimmed.dropFirst(2).trimmingCharacters(in: .whitespaces)))
                            .font(CloseClawTheme.Typography.body())
                    }
                    .padding(.leading, 4)
                } else if let range = trimmed.range(of: #"^\d+\.\s"#, options: .regularExpression) {
                    HStack(alignment: .top, spacing: 8) {
                        Text(trimmed[trimmed.startIndex..<range.upperBound])
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(CloseClawTheme.accentSecondary)
                        Text(LocalizedStringKey(trimmed[range.upperBound...].trimmingCharacters(in: .whitespaces)))
                            .font(CloseClawTheme.Typography.body())
                    }
                    .padding(.leading, 4)
                } else {
                    Text(LocalizedStringKey(line))
                        .font(CloseClawTheme.Typography.body())
                        .lineSpacing(4)
                }
            }
        }
        .foregroundStyle(role == .user ? .white : CloseClawTheme.textPrimary)
    }
    
    @ViewBuilder
    private func codeBlock(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                Text(text)
                    .font(.system(.subheadline, design: .monospaced))
                    .padding(12)
                    .foregroundStyle(role == .user ? .white.opacity(0.9) : CloseClawTheme.textSecondary)
            }
        }
        .background(
            RoundedRectangle(cornerRadius: 8)
                .fill(role == .user ? Color.black.opacity(0.2) : CloseClawTheme.surfaceHover)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(role == .user ? Color.white.opacity(0.1) : CloseClawTheme.cardBorder, lineWidth: 1)
        )
        .padding(.vertical, 4)
    }
    
    private struct Segment {
        let text: String
        let isCode: Bool
    }
    
    private func parseSegments(_ input: String) -> [Segment] {
        var segments: [Segment] = []
        let parts = input.components(separatedBy: "```")
        
        for (index, part) in parts.enumerated() {
            let isCode = index % 2 != 0
            var text = part
            
            if isCode {
                // Strip language tags from start of code block (e.g. "json\n", "swift\n")
                if let firstNewline = text.firstIndex(of: "\n") {
                    let firstLine = String(text[..<firstNewline]).trimmingCharacters(in: .whitespaces)
                    if !firstLine.isEmpty && !firstLine.contains(" ") {
                        text = String(text[text.index(after: firstNewline)...])
                    }
                }
            }
            
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                segments.append(Segment(text: trimmed, isCode: isCode))
            }
        }
        
        return segments
    }
}

