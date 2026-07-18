import SwiftUI
import PhotosUI

/// The input dock as an iOS 26 Liquid Glass field: a growing text field with an image
/// attach button (PhotosPicker) + pending thumbnails, and a circular send / stop.
struct Composer: View {
    @Environment(\.theme) private var theme
    @Binding var draft: String
    var busy: Bool
    var focused: FocusState<Bool>.Binding
    var onSend: ([PendingImage]) -> Void
    var onStop: () -> Void

    @State private var images: [PendingImage] = []
    @State private var pickerItems: [PhotosPickerItem] = []

    private var canSend: Bool {
        !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || !images.isEmpty
    }
    private var isFocused: Bool { focused.wrappedValue }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !images.isEmpty { thumbnails }
            HStack(alignment: .bottom, spacing: 8) {
                PhotosPicker(selection: $pickerItems, maxSelectionCount: 4, matching: .images) {
                    Image(systemName: "photo.badge.plus")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(theme.holoSoft)
                        .frame(width: 34, height: 34)
                }
                .onChange(of: pickerItems) { _, items in Task { await load(items) } }

                TextField("Message Nero", text: $draft, axis: .vertical)
                    .font(Typeface.ui(15))
                    .foregroundStyle(theme.text)
                    .tint(theme.holo())
                    .lineLimit(1...6)
                    .focused(focused)
                    .padding(.vertical, 9)

                if busy {
                    Button(action: onStop) {
                        Image(systemName: "stop.fill")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(theme.holo2())
                            .frame(width: 34, height: 34)
                            .background(theme.holo2(0.16), in: Circle())
                            .overlay(Circle().strokeBorder(theme.holo2(0.3)))
                    }
                    .buttonStyle(PressableButtonStyle())
                } else {
                    Button { send() } label: {
                        Image(systemName: "arrow.up")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(theme.void_)
                            .frame(width: 34, height: 34)
                            .background(
                                LinearGradient(colors: [theme.holoSoft, theme.holo()], startPoint: .top, endPoint: .bottom),
                                in: Circle()
                            )
                            .shadow(color: theme.holo(canSend ? 0.55 : 0), radius: 8)
                            .opacity(canSend ? 1 : 0.35)
                    }
                    .buttonStyle(PressableButtonStyle())
                    .disabled(!canSend)
                }
            }
        }
        .padding(4)
        .padding(.leading, 4)
        .glassEffect(.regular.tint(theme.holo(isFocused ? 0.10 : 0.05)), in: shape)
        .animation(.easeOut(duration: 0.2), value: isFocused)
        .animation(.easeOut(duration: 0.2), value: images)
    }

    private var thumbnails: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(images) { img in
                    ZStack(alignment: .topTrailing) {
                        if let ui = UIImage(data: img.data) {
                            Image(uiImage: ui).resizable().scaledToFill()
                                .frame(width: 58, height: 58)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(theme.holo(0.25)))
                        }
                        Button { images.removeAll { $0.id == img.id } } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.system(size: 16))
                                .foregroundStyle(.white, .black.opacity(0.5))
                        }
                        .padding(3)
                    }
                }
            }
            .padding(.horizontal, 6).padding(.top, 6)
        }
    }

    private var shape: RoundedRectangle { RoundedRectangle(cornerRadius: 24, style: .continuous) }

    private func send() {
        guard canSend else { return }
        onSend(images)
        images = []
    }

    /// Load picked photos, downscale + re-encode as JPEG so the payload + vision input
    /// stay reasonable (photos can be many MB / HEIC).
    private func load(_ items: [PhotosPickerItem]) async {
        for item in items {
            guard let raw = try? await item.loadTransferable(type: Data.self),
                  let ui = UIImage(data: raw) else { continue }
            let scaled = ui.downscaled(maxDimension: 1568)
            guard let jpeg = scaled.jpegData(compressionQuality: 0.85) else { continue }
            await MainActor.run { images.append(PendingImage(data: jpeg, mime: "image/jpeg", name: "photo.jpg")) }
        }
        await MainActor.run { pickerItems = [] }
    }
}

private extension UIImage {
    func downscaled(maxDimension: CGFloat) -> UIImage {
        let m = max(size.width, size.height)
        guard m > maxDimension else { return self }
        let s = maxDimension / m
        let newSize = CGSize(width: size.width * s, height: size.height * s)
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        return UIGraphicsImageRenderer(size: newSize, format: fmt).image { _ in
            draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
