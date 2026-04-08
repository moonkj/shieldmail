import UIKit

/// Maps string-typed haptic style names (from JS content scripts) to
/// UIKit feedback generator calls.
///
/// Called by SafariExtensionHandler when the content script sends a
/// { type: "haptic", style: "medium" } message.
final class HapticBridge {

    func trigger(style: String) {
        DispatchQueue.main.async {
            switch style {
            case "light":
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            case "medium":
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case "heavy":
                UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            case "success":
                UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "error":
                UINotificationFeedbackGenerator().notificationOccurred(.error)
            case "warning":
                UINotificationFeedbackGenerator().notificationOccurred(.warning)
            case "selection":
                UISelectionFeedbackGenerator().selectionChanged()
            default:
                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            }
        }
    }
}
