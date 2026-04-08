import SwiftUI
import UIKit

/// Minimal container app UI.
/// The real product experience lives in the Safari Extension.
/// This screen guides the user to activate the extension in Safari settings.
struct ContentView: View {
    @State private var extensionEnabled = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 32) {
                    // Logo
                    VStack(spacing: 12) {
                        Image("shield-mail-color")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 80, height: 80)
                            .accessibility(hidden: true)

                        Text("ShieldMail")
                            .font(.largeTitle.bold())

                        Text("가입 스트레스를 제거하는 자동화 인프라")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 48)

                    // Status banner
                    statusBanner

                    // Setup steps
                    VStack(alignment: .leading, spacing: 16) {
                        Text("시작하기")
                            .font(.headline)

                        SetupStep(
                            number: 1,
                            title: "Safari 설정 열기",
                            description: "Safari → 설정 → 확장 프로그램 탭",
                            icon: "safari",
                            done: extensionEnabled
                        )

                        SetupStep(
                            number: 2,
                            title: "ShieldMail 활성화",
                            description: "ShieldMail 옆 토글을 켜고\n\"모든 웹사이트 허용\" 선택",
                            icon: "checkmark.shield",
                            done: extensionEnabled
                        )

                        SetupStep(
                            number: 3,
                            title: "이메일 가입 시 방패 아이콘 탭",
                            description: "이메일 필드 오른쪽 아래에 🛡 아이콘이 나타납니다",
                            icon: "envelope.badge.shield.half.filled",
                            done: false
                        )
                    }
                    .padding(.horizontal, 24)

                    // Open Safari Settings button
                    Button {
                        openExtensionSettings()
                    } label: {
                        Label("Safari 확장 설정 열기", systemImage: "safari")
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 0, green: 0.478, blue: 1.0)) // #007AFF
                    .padding(.horizontal, 24)

                    // Privacy note
                    VStack(spacing: 4) {
                        Label("메일 내용은 저장되지 않습니다", systemImage: "lock.shield")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("OTP와 링크만 10분간 메모리에 보관 후 자동 삭제")
                            .font(.caption2)
                            .foregroundStyle(Color(.tertiaryLabel))
                    }
                    .padding(.bottom, 32)
                }
            }
            .navigationBarHidden(true)
            .onAppear {
                checkExtensionStatus()
            }
            .onReceive(
                NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)
            ) { _ in
                checkExtensionStatus()
            }
        }
    }

    // MARK: - Status Banner

    @ViewBuilder
    private var statusBanner: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(extensionEnabled ? Color(red: 0, green: 0.831, blue: 0.667) : Color(.systemGray3))
                .frame(width: 10, height: 10)

            Text(extensionEnabled ? "확장 프로그램 활성화됨" : "확장 프로그램 비활성화됨")
                .font(.subheadline)
                .foregroundStyle(extensionEnabled ? Color(red: 0, green: 0.831, blue: 0.667) : .secondary)

            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 12)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color(.secondarySystemBackground))
        )
        .padding(.horizontal, 24)
    }

    // MARK: - Helpers

    private func checkExtensionStatus() {
        // Extension status detection via SFSafariExtensionManager requires
        // a Safari-provisioned entitlement that cannot be checked at build time
        // in an unsigned configuration. The banner defaults to "disabled" and
        // the user follows the onboarding steps to activate manually.
        // TODO: re-enable with signed build + provisioning profile.
        DispatchQueue.main.async { self.extensionEnabled = false }
    }

    private func openExtensionSettings() {
        // On iOS there is no SFSafariApplication.showPreferencesForExtension.
        // Deep-link to the app's row in the Settings app; from there the user
        // can navigate to Safari → Extensions → ShieldMail.
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}

// MARK: - SetupStep Component

private struct SetupStep: View {
    let number: Int
    let title: String
    let description: String
    let icon: String
    let done: Bool

    var body: some View {
        HStack(alignment: .top, spacing: 16) {
            ZStack {
                Circle()
                    .fill(done
                        ? Color(red: 0, green: 0.831, blue: 0.667)  // #00D4AA
                        : Color(.systemGray5))
                    .frame(width: 36, height: 36)

                if done {
                    Image(systemName: "checkmark")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(.white)
                } else {
                    Text("\(number)")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(Color(.secondaryLabel))
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    Image(systemName: icon)
                        .font(.system(size: 14))
                        .foregroundStyle(Color(red: 0, green: 0.478, blue: 1.0))
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                }
                Text(description)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }
}

#Preview {
    ContentView()
}
