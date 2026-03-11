import SwiftUI

struct CreditsTabView: View {
    @ObservedObject var viewModel: CreditsViewModel
    let onRefresh: () async -> Void

    var body: some View {
        NavigationStack {
            ZStack {
                NebulaBackground().ignoresSafeArea()
                
                ScrollView {
                    VStack(spacing: 20) {
                        if viewModel.isLoading {
                            VStack(spacing: 12) {
                                ProgressView()
                                    .tint(CloseClawTheme.accentPrimary)
                                Text("Refreshing billing details...")
                                    .font(CloseClawTheme.Typography.footnote())
                                    .foregroundStyle(CloseClawTheme.textSecondary)
                            }
                            .frame(maxWidth: .infinity, minHeight: 100)
                        }

                        if let credits = viewModel.credits {
                            VStack(spacing: 16) {
                                CreditStatCard(
                                    title: "Current Balance",
                                    value: String(format: "%.2f", credits.api_credits),
                                    subtitle: "Platform Plan: \(credits.plan.capitalized)"
                                )
                                .staggeredReveal(index: 0)
                            }
                        } else {
                            VStack(spacing: 16) {
                                Image(systemName: "creditcard.trianglebadge.exclamationmark")
                                    .font(.system(size: 44))
                                    .foregroundStyle(CloseClawTheme.textSecondary)
                                
                                Text("No Usage Data")
                                    .font(CloseClawTheme.Typography.headline())
                                
                                Text("Connect your API billing to see usage details.")
                                    .font(CloseClawTheme.Typography.body())
                                    .foregroundStyle(CloseClawTheme.textSecondary)
                                    .multilineTextAlignment(.center)
                            }
                            .padding(.top, 60)
                        }
                    }
                    .padding(20)
                }
            }
            .navigationTitle("Usage & Credits")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task { await onRefresh() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundStyle(CloseClawTheme.textSecondary)
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
