import SwiftUI

struct ChatTabView: View {
    @ObservedObject var viewModel: ChatViewModel

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if viewModel.isLoadingHistory {
                    ProgressView("Loading conversation...")
                        .tint(CloseClawTheme.accentPrimary)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            LazyVStack(spacing: 10) {
                                ForEach(viewModel.messages) { message in
                                    MessageBubble(message: message)
                                        .id(message.id)
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
                            .padding(.horizontal, 14)
                            .padding(.top, 12)
                            .padding(.bottom, 6)
                        }
                        .onChange(of: viewModel.messages.count) { _ in
                            scrollToBottom(with: proxy)
                        }
                        .onChange(of: viewModel.streamingText) { _ in
                            scrollToBottom(with: proxy)
                        }
                    }
                }

                Divider()
                    .overlay(CloseClawTheme.cardBorder)

                HStack(alignment: .bottom, spacing: 8) {
                    TextField("Message CloseClaw...", text: $viewModel.composerText, axis: .vertical)
                        .lineLimit(1 ... 6)
                        .padding(10)
                        .foregroundStyle(CloseClawTheme.textPrimary)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(CloseClawTheme.surfaceBase)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                                        .stroke(CloseClawTheme.cardBorder, lineWidth: 1)
                                )
                        )

                    if viewModel.isSending {
                        Button {
                            Task { await viewModel.abort() }
                        } label: {
                            Image(systemName: "stop.fill")
                                .frame(width: 36, height: 36)
                        }
                        .foregroundStyle(CloseClawTheme.textPrimary)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(CloseClawTheme.surfaceHover)
                        )
                    } else {
                        Button {
                            Task { await viewModel.send() }
                        } label: {
                            Image(systemName: "paperplane.fill")
                                .frame(width: 36, height: 36)
                        }
                        .foregroundStyle(.white)
                        .background(
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(CloseClawTheme.accentPrimary)
                        )
                        .disabled(viewModel.composerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
            }
            .background(CloseClawTheme.bgRoot.ignoresSafeArea())
            .navigationTitle("Chat")
            .foregroundStyle(CloseClawTheme.textPrimary)
            .toolbarBackground(CloseClawTheme.bgRoot, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await viewModel.loadHistory() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .foregroundStyle(CloseClawTheme.accentPrimary)
                }
            }
        }
    }

    private func scrollToBottom(with proxy: ScrollViewProxy) {
        if let last = viewModel.messages.last {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo(last.id, anchor: .bottom)
            }
        } else if viewModel.streamingText != nil {
            withAnimation(.easeOut(duration: 0.2)) {
                proxy.scrollTo("streaming", anchor: .bottom)
            }
        }
    }
}

private struct MessageBubble: View {
    let message: ChatMessage
    var isStreaming = false

    var body: some View {
        HStack {
            if message.role == .user {
                Spacer(minLength: 36)
            }
            VStack(alignment: .leading, spacing: 6) {
                Text(message.content)
                    .textSelection(.enabled)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if isStreaming {
                    ProgressView()
                        .controlSize(.small)
                }
            }
            .padding(10)
            .foregroundStyle(foreground)
            .background(background)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            if message.role != .user {
                Spacer(minLength: 36)
            }
        }
    }

    private var background: Color {
        switch message.role {
        case .user:
            return CloseClawTheme.accentPrimary
        case .assistant:
            return CloseClawTheme.surfaceBase
        case .system:
            return CloseClawTheme.accentSecondary.opacity(0.2)
        }
    }

    private var foreground: Color {
        message.role == .user ? .white : CloseClawTheme.textPrimary
    }
}
