import SwiftUI

struct SettingsTabView: View {
    let user: UserProfile?
    let gatewayStatusText: String
    let onReconnect: () async -> Void
    let onSignOut: () async -> Void

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    LabeledContent("User ID", value: user?.id ?? "-")
                    LabeledContent("Email", value: user?.email ?? "-")
                }

                Section("Gateway") {
                    LabeledContent("Status", value: gatewayStatusText)
                    Button {
                        Task {
                            await onReconnect()
                        }
                    } label: {
                        Text("Reconnect Gateway")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        Task {
                            await onSignOut()
                        }
                    } label: {
                        Text("Sign Out")
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(CloseClawTheme.bgRoot.ignoresSafeArea())
            .foregroundStyle(CloseClawTheme.textPrimary)
            .listRowBackground(CloseClawTheme.surfaceBase)
            .navigationTitle("Settings")
            .toolbarBackground(CloseClawTheme.bgRoot, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
        }
    }
}
