import SwiftUI
import UIKit

/// The actual camera, not the photo library. `.photosPicker` only ever opens the
/// library, so the dial's CAMERA slot used to make you go find a photo instead of
/// taking one. Needs NSCameraUsageDescription, which is in Resources/Info.plist.
///
/// Falls back to the library on a device with no camera (a Mac running the iPad app,
/// a simulator), so the slot always does something.
struct CameraPicker: UIViewControllerRepresentable {
    /// Handed a JPEG ready to send.
    var onCapture: (Data) -> Void
    var onCancel: () -> Void

    static var available: Bool {
        UIImagePickerController.isSourceTypeAvailable(.camera)
    }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = Self.available ? .camera : .photoLibrary
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onCapture: onCapture, onCancel: onCancel)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        private let onCapture: (Data) -> Void
        private let onCancel: () -> Void

        init(onCapture: @escaping (Data) -> Void, onCancel: @escaping () -> Void) {
            self.onCapture = onCapture
            self.onCancel = onCancel
        }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            guard let image = info[.originalImage] as? UIImage else { return onCancel() }
            // downscale before it becomes a vision payload; full-res camera frames are
            // several MB and the model doesn't need them
            let scaled = image.fitted(maxDimension: 1568)
            guard let jpeg = scaled.jpegData(compressionQuality: 0.85) else { return onCancel() }
            onCapture(jpeg)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onCancel()
        }
    }
}

private extension UIImage {
    func fitted(maxDimension: CGFloat) -> UIImage {
        let m = max(size.width, size.height)
        guard m > maxDimension else { return self }
        let s = maxDimension / m
        let target = CGSize(width: size.width * s, height: size.height * s)
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale = 1
        return UIGraphicsImageRenderer(size: target, format: fmt).image { _ in
            draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
