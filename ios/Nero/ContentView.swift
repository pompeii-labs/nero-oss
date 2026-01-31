import SwiftUI

struct ContentView: View {
    @EnvironmentObject var neroManager: NeroManager
    @EnvironmentObject var toastManager: ToastManager

    var body: some View {
        ZStack {
            Color.nBackground
                .ignoresSafeArea()

            if neroManager.isConnected {
                MainTabView()
            } else {
                SetupView()
            }
        }
        .overlay(alignment: .top) {
            ToastOverlay()
        }
        .task {
            if !neroManager.serverURL.isEmpty {
                await neroManager.checkConnection()
            }
        }
    }
}

struct ToastOverlay: View {
    @EnvironmentObject var toastManager: ToastManager

    var body: some View {
        VStack(spacing: 8) {
            ForEach(toastManager.toasts) { toast in
                ToastView(toast: toast)
                    .transition(.asymmetric(
                        insertion: .move(edge: .top).combined(with: .opacity).combined(with: .scale(scale: 0.9)),
                        removal: .move(edge: .top).combined(with: .opacity)
                    ))
            }
        }
        .padding(.top, 8)
        .animation(.spring(response: 0.35, dampingFraction: 0.75), value: toastManager.toasts.count)
    }
}

struct ToastView: View {
    let toast: Toast

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(toast.type.color.opacity(0.15))
                    .frame(width: 28, height: 28)

                Image(systemName: toast.type.icon)
                    .font(.system(size: 14))
                    .foregroundColor(toast.type.color)
            }

            Text(toast.message)
                .font(.subheadline.weight(.medium))
                .foregroundColor(.white)

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            LinearGradient(
                colors: [Color.nCard, Color.nCard.opacity(0.95)],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(
                    LinearGradient(
                        colors: [toast.type.color.opacity(0.3), Color.nBorder],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    ),
                    lineWidth: 1
                )
        )
        .shadow(color: toast.type.color.opacity(0.2), radius: 10, y: 4)
        .shadow(color: .black.opacity(0.3), radius: 8, y: 4)
        .padding(.horizontal, 16)
    }
}

#Preview {
    ContentView()
        .environmentObject(NeroManager.shared)
        .environmentObject(APIManager.shared)
        .environmentObject(VoiceManager.shared)
        .environmentObject(ToastManager.shared)
}
