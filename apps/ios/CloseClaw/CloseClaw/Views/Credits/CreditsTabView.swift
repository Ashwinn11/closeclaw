import SwiftUI

struct CreditsTabView: View {
    @ObservedObject var viewModel: CreditsViewModel
    let onRefresh: () async -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 12) {
                    if viewModel.isLoading {
                        ProgressView("Refreshing credits...")
                            .tint(CloseClawTheme.accentPrimary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    if let credits = viewModel.credits {
                        CreditStatCard(
                            title: "Balance",
                            value: String(format: "%.2f", credits.api_credits),
                            subtitle: "Plan: \(credits.plan.capitalized)"
                        )
                        CreditStatCard(
                            title: "Monthly Cap",
                            value: String(format: "%.2f", credits.api_credits_cap),
                            subtitle: credits.subscription_renews_at.map { "Renews: \($0)" } ?? "No renewal date"
                        )
                    } else {
                        ContentUnavailableView(
                            "No Credits Data",
                            systemImage: "creditcard.trianglebadge.exclamationmark",
                            description: Text("Pull billing details once your API is configured.")
                        )
                    }
                }
                .padding(14)
            }
            .background(CloseClawTheme.bgRoot.ignoresSafeArea())
            .navigationTitle("Credits")
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

private struct CreditStatCard: View {
    let title: String
    let value: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(CloseClawTheme.textSecondary)
            Text(value)
                .font(.system(.title2, design: .rounded).weight(.semibold))
                .foregroundStyle(CloseClawTheme.textPrimary)
            Text(subtitle)
                .font(.footnote)
                .foregroundStyle(CloseClawTheme.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .closeClawGlassCard()
    }
}
