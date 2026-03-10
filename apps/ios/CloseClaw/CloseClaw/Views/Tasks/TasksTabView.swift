import SwiftUI

struct TasksTabView: View {
    @ObservedObject var viewModel: TasksViewModel
    let onRefresh: () async -> Void

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.isLoading {
                    ProgressView("Loading tasks...")
                        .tint(CloseClawTheme.accentPrimary)
                } else if viewModel.jobs.isEmpty {
                    ContentUnavailableView(
                        "No Scheduled Tasks",
                        systemImage: "clock.badge.xmark",
                        description: Text("Create cron jobs in the dashboard now. In-app creation can be the next step.")
                    )
                } else {
                    List(viewModel.jobs) { job in
                        VStack(alignment: .leading, spacing: 6) {
                            Text(job.name ?? "Untitled job")
                                .font(.headline)
                                .foregroundStyle(CloseClawTheme.textPrimary)
                            if let prompt = job.prompt, !prompt.isEmpty {
                                Text(prompt)
                                    .font(.subheadline)
                                    .foregroundStyle(CloseClawTheme.textSecondary)
                                    .lineLimit(3)
                            }
                            HStack(spacing: 10) {
                                if let cron = job.cron {
                                    Label(cron, systemImage: "calendar")
                                }
                                Label((job.enabled ?? false) ? "Enabled" : "Disabled", systemImage: "switch.2")
                            }
                            .font(.caption)
                            .foregroundStyle(CloseClawTheme.textSecondary)
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(CloseClawTheme.surfaceBase)
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .background(CloseClawTheme.bgRoot.ignoresSafeArea())
            .navigationTitle("Tasks")
            .foregroundStyle(CloseClawTheme.textPrimary)
            .toolbarBackground(CloseClawTheme.bgRoot, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await onRefresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                    .foregroundStyle(CloseClawTheme.accentPrimary)
                }
            }
        }
    }
}
