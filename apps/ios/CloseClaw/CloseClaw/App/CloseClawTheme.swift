import SwiftUI

enum CloseClawTheme {
    // Colors
    static let bgRoot = Color(hex: "#040508")
    static let surfaceBase = Color.white.opacity(0.03)
    static let surfaceHover = Color.white.opacity(0.06)
    static let textPrimary = Color(hex: "#ECEEF3")
    static let textSecondary = Color(hex: "#8E96A3")
    
    static let accentPrimary = Color(hex: "#FF4D4D")
    static let accentGlow = Color(hex: "#FF4D4D").opacity(0.3)
    
    static let accentSecondary = Color(hex: "#00E5CC")
    static let accentSecondaryGlow = Color(hex: "#00E5CC").opacity(0.3)
    
    static let cardBorder = Color.white.opacity(0.08)
    
    // MARK: - Spacing
    // Use these instead of magic numbers throughout the app
    struct Spacing {
        static let xs: CGFloat   = 4
        static let sm: CGFloat   = 8
        static let md: CGFloat   = 16
        static let lg: CGFloat   = 24
        static let xl: CGFloat   = 32
        static let xxl: CGFloat  = 48
    }

    // MARK: - Corner Radii
    struct Radius {
        /// Apple-standard app icon squircle corner radius (22% of side length)
        static func icon(_ size: CGFloat) -> CGFloat { size * 0.2237 }
        /// Card / sheet level
        static let card: CGFloat   = 20
        /// Button / pill level
        static let button: CGFloat = 14
        /// Inner / small chip level
        static let chip: CGFloat   = 10
    }
    
    // Typography
    struct Typography {
        static func title(_ size: CGFloat = 34) -> Font {
            .system(size: size, weight: .bold, design: .rounded)
        }
        
        static func headline(_ size: CGFloat = 20) -> Font {
            .system(size: size, weight: .semibold, design: .rounded)
        }
        
        static func body(_ size: CGFloat = 16) -> Font {
            .system(size: size, weight: .medium, design: .rounded)
        }
        
        static func subtitle(_ size: CGFloat = 15) -> Font {
            .system(size: size, weight: .medium, design: .rounded)
        }
        
        static func footnote(_ size: CGFloat = 13) -> Font {
            .system(size: size, weight: .regular, design: .rounded)
        }
    }
}

// MARK: - Color Extension
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
            red = 255; green = 255; blue = 255
        }
        self.init(.sRGB, red: Double(red) / 255, green: Double(green) / 255, blue: Double(blue) / 255, opacity: 1)
    }
}

// MARK: - View Modifiers
struct GlassCardModifier: ViewModifier {
    var cornerRadius: CGFloat = 16
    var padding: CGFloat = 16
    
    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(
                ZStack {
                    CloseClawTheme.surfaceBase
                    VisualEffectBlur(blurStyle: .systemUltraThinMaterialDark)
                }
            )
            .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .stroke(CloseClawTheme.cardBorder, lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.2), radius: 20, x: 0, y: 10)
    }
}

struct StaggeredRevealModifier: ViewModifier {
    let index: Int
    @State private var isVisible = false
    
    func body(content: Content) -> some View {
        content
            .opacity(isVisible ? 1 : 0)
            .offset(y: isVisible ? 0 : 20)
            .onAppear {
                withAnimation(.spring(response: 0.6, dampingFraction: 0.8).delay(Double(index) * 0.1)) {
                    isVisible = true
                }
            }
    }
}

extension View {
    func closeClawGlassCard(cornerRadius: CGFloat = 16, padding: CGFloat = 16) -> some View {
        modifier(GlassCardModifier(cornerRadius: cornerRadius, padding: padding))
    }
    
    func staggeredReveal(index: Int) -> some View {
        modifier(StaggeredRevealModifier(index: index))
    }
    
    func premiumTextGradient() -> some View {
        self.foregroundStyle(
            LinearGradient(
                colors: [CloseClawTheme.accentPrimary, Color(hex: "#FF8A8E")],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }
}

// MARK: - Atmosphere
struct NebulaBackground: View {
    @State private var animate = false
    
    var body: some View {
        ZStack {
            CloseClawTheme.bgRoot.ignoresSafeArea()
            
            // Floating Glows
            ZStack {
                NebulaGlow(color: CloseClawTheme.accentGlow)
                    .offset(x: animate ? 100 : -100, y: animate ? -100 : 100)
                
                NebulaGlow(color: CloseClawTheme.accentSecondaryGlow)
                    .offset(x: animate ? -150 : 150, y: animate ? 150 : -150)
                
                NebulaGlow(color: CloseClawTheme.accentGlow.opacity(0.15))
                    .offset(x: animate ? 50 : -50, y: animate ? 100 : -100)
            }
            .blur(radius: 80)
            .opacity(0.6)
            .onAppear {
                withAnimation(.easeInOut(duration: 10).repeatForever(autoreverses: true)) {
                    animate.toggle()
                }
            }
        }
    }
}

private struct NebulaGlow: View {
    let color: Color
    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 400, height: 400)
    }
}

// MARK: - Utilities
struct VisualEffectBlur: UIViewRepresentable {
    var blurStyle: UIBlurEffect.Style
    func makeUIView(context: Context) -> UIVisualEffectView {
        UIVisualEffectView(effect: UIBlurEffect(style: blurStyle))
    }
    func updateUIView(_ uiView: UIVisualEffectView, context: Context) {
        uiView.effect = UIBlurEffect(style: blurStyle)
    }
}

// MARK: - App Logo
/// Single source of truth for the CloseClaw logo.
/// Always renders with the Apple-standard squircle corner radius (22.37% of size)
/// matching how the OS draws app icons — same on auth, loading, and any other screen.
struct AppLogo: View {
    var size: CGFloat = 100
    var glowing: Bool = true
    var pulsing: Bool = false

    @State private var isPulsing = false

    private var radius: CGFloat { CloseClawTheme.Radius.icon(size) }

    var body: some View {
        Image("logo3")
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
            .shadow(color: glowing ? CloseClawTheme.accentGlow : .clear, radius: 24)
            .scaleEffect(pulsing ? (isPulsing ? 1.05 : 0.95) : 1.0)
            .opacity(pulsing ? (isPulsing ? 1.0 : 0.6) : 1.0)
            .animation(
                pulsing ? .easeInOut(duration: 1.2).repeatForever(autoreverses: true) : .default,
                value: isPulsing
            )
            .onAppear {
                if pulsing { isPulsing = true }
            }
    }
}
