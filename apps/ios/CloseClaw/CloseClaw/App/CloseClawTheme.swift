import SwiftUI

enum CloseClawTheme {
    static let bgRoot = Color(hex: "#040508")
    static let surfaceBase = Color.white.opacity(0.03)
    static let surfaceHover = Color.white.opacity(0.05)
    static let textPrimary = Color(hex: "#ECEEF3")
    static let textSecondary = Color(hex: "#8E96A3")
    static let accentPrimary = Color(hex: "#FF4D4D")
    static let accentSecondary = Color(hex: "#00E5CC")
    static let accentGlow = Color(red: 1.0, green: 0.302, blue: 0.302).opacity(0.3)
    static let cardBorder = Color.white.opacity(0.08)
}

extension Color {
    init(hex: String) {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&int)
        let red, green, blue: UInt64
        switch cleaned.count {
        case 6:
            red = (int >> 16) & 0xFF
            green = (int >> 8) & 0xFF
            blue = int & 0xFF
        default:
            red = 255
            green = 255
            blue = 255
        }
        self.init(
            .sRGB,
            red: Double(red) / 255,
            green: Double(green) / 255,
            blue: Double(blue) / 255,
            opacity: 1
        )
    }
}

struct GlassCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(14)
            .background(CloseClawTheme.surfaceBase)
            .overlay(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(CloseClawTheme.cardBorder, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

extension View {
    func closeClawGlassCard() -> some View {
        modifier(GlassCardModifier())
    }
}
