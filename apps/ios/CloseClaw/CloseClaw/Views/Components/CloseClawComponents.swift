import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

// MARK: - Buttons
struct CloseClawButton: View {
    enum Variant {
        case primary
        case secondary
        case ghost
        case destructive
    }
    
    let title: String
    var variant: Variant = .primary
    var isLoading: Bool = false
    var action: () -> Void
    
    var body: some View {
        Button(action: action) {
            ZStack {
                // Background & Glow
                backgroundView
                    .overlay(
                        Capsule()
                            .stroke(borderColor, lineWidth: 1)
                    )
                    .overlay(
                        // Premium "Breathing" Glow when loading
                        Group {
                            if isLoading {
                                Capsule()
                                    .fill(variant == .primary ? CloseClawTheme.accentPrimary : (variant == .destructive ? .red : CloseClawTheme.accentSecondary))
                                    .scaleEffect(1.05)
                                    .blur(radius: 12)
                                    .opacity(isAnimatingGlow ? 0.3 : 0.6)
                            }
                        }
                    )
                
                // Content
                HStack(spacing: 12) {
                    if isLoading {
                        CoreLoaderRing()
                            .frame(width: 20, height: 20)
                    }
                    
                    Text(title)
                        .font(CloseClawTheme.Typography.body(17).weight(.bold))
                        .opacity(isLoading ? 0 : 1)
                }
                .foregroundStyle(foregroundColor)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 54)
            .background(backgroundView)
            .clipShape(Capsule())
            .overlay(
                Capsule()
                    .stroke(borderColor, lineWidth: 1)
            )
            .shadow(color: shadowColor, radius: 15, y: 8)
        }
        .disabled(isLoading)
        .buttonStyle(CloseClawButtonStyle())
        .onAppear {
            if isLoading { startGlowAnimation() }
        }
        .onChange(of: isLoading) { _, newValue in
            if newValue { startGlowAnimation() }
        }
    }
    
    @State private var isAnimatingGlow = false
    
    private func startGlowAnimation() {
        withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true)) {
            isAnimatingGlow = true
        }
    }
    
    // Custom Sleek Loader
    struct CoreLoaderRing: View {
        @State private var isAnimating = false
        
        var body: some View {
            Circle()
                .trim(from: 0, to: 0.7)
                .stroke(
                    AngularGradient(
                        colors: [.white.opacity(0), .white],
                        center: .center
                    ),
                    style: StrokeStyle(lineWidth: 2, lineCap: .round)
                )
                .rotationEffect(Angle(degrees: isAnimating ? 360 : 0))
                .onAppear {
                    withAnimation(.linear(duration: 1).repeatForever(autoreverses: false)) {
                        isAnimating = true
                    }
                }
        }
    }
    
    @ViewBuilder
    private var backgroundView: some View {
        switch variant {
        case .primary:
            LinearGradient(
                colors: [CloseClawTheme.accentPrimary, Color(hex: "#FF6B6B")],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        case .secondary:
            CloseClawTheme.surfaceBase
        case .ghost:
            Color.clear
        case .destructive:
            Color.red.opacity(0.1)
        }
    }
    
    private var foregroundColor: Color {
        switch variant {
        case .primary:
            return .white
        case .secondary:
            return CloseClawTheme.textPrimary
        case .ghost:
            return CloseClawTheme.textSecondary
        case .destructive:
            return .red
        }
    }
    
    private var borderColor: Color {
        switch variant {
        case .secondary:
            return CloseClawTheme.accentSecondary.opacity(0.3)
        case .destructive:
            return Color.red.opacity(0.3)
        default:
            return .clear
        }
    }
    
    private var shadowColor: Color {
        variant == .primary ? CloseClawTheme.accentGlow : .clear
    }
}

struct CloseClawButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

// MARK: - Text Field
struct CloseClawTextField: View {
    let placeholder: String
    @Binding var text: String
    var isSecure: Bool = false
    
    var body: some View {
        Group {
            if isSecure {
                SecureField("", text: $text, prompt: Text(placeholder).foregroundColor(CloseClawTheme.textSecondary))
            } else {
                TextField("", text: $text, prompt: Text(placeholder).foregroundColor(CloseClawTheme.textSecondary))
            }
        }
        .font(CloseClawTheme.Typography.body())
        .padding(14)
        .background(CloseClawTheme.surfaceBase)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(CloseClawTheme.cardBorder, lineWidth: 1)
        )
        .foregroundStyle(CloseClawTheme.textPrimary)
    }
}

#if os(iOS)
// MARK: - UX Helpers
struct KeyboardDismissModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .onTapGesture {
                UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
            }
    }
}

extension View {
    func tapToDismissKeyboard() -> some View {
        modifier(KeyboardDismissModifier())
    }
}
#endif
