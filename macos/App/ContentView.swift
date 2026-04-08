import SwiftUI
import SafariServices

/// Container app UI for macOS.
///
/// On macOS, SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier:)
/// is supported (unlike iOS), so we can show a live status indicator.
struct ContentView: View {
    @State private var extensionEnabled = false

    var body: some View {
        VStack(spacing: 32) {
            VStack(spacing: 12) {
                Image(systemName: "shield.lefthalf.filled")
                    .resizable()
                    .scaledToFit()
                    .frame(width: 72, height: 72)
                    .foregroundStyle(Color(red: 0, green: 0.478, blue: 1.0))

                Text("ShieldMail")
                    .font(.largeTitle.bold())

                Text("가입 스트레스를 제거하는 자동화 인프라")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(.top, 32)

            statusBanner

            VStack(alignment: .leading, spacing: 12) {
                Text("시작하기")
                    .font(.headline)

                StepRow(
                    number: 1,
                    title: "Safari 확장 프로그램 환경설정 열기",
                    detail: "아래 버튼을 누르거나 Safari → 설정 → 확장 프로그램"
                )

                StepRow(
                    number: 2,
                    title: "ShieldMail 활성화",
                    detail: "체크박스를 켜고 모든 웹사이트 접근을 허용"
                )

                StepRow(
                    number: 3,
                    title: "회원가입 폼에서 방패 아이콘 클릭",
                    detail: "이메일 필드 옆에 🛡 아이콘이 자동으로 나타납니다"
                )
            }
            .padding(.horizontal, 24)

            Button {
                openSafariPreferences()
            } label: {
                Label("Safari 확장 환경설정 열기", systemImage: "safari")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0, green: 0.478, blue: 1.0))
            .padding(.horizontal, 24)

            VStack(spacing: 4) {
                Label("메일 내용은 저장되지 않습니다", systemImage: "lock.shield")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("OTP와 링크만 10분간 메모리에 보관 후 자동 삭제")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.bottom, 24)
        }
        .padding()
        .onAppear { checkExtensionStatus() }
    }

    @ViewBuilder
    private var statusBanner: some View {
        HStack(spacing: 12) {
            Circle()
                .fill(extensionEnabled ? Color.green : Color.gray)
                .frame(width: 10, height: 10)
            Text(extensionEnabled ? "확장 프로그램 활성화됨" : "확장 프로그램 비활성화됨")
                .font(.subheadline)
                .foregroundStyle(extensionEnabled ? .green : .secondary)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(Color(NSColor.controlBackgroundColor))
        )
        .padding(.horizontal, 24)
    }

    private func checkExtensionStatus() {
        SFSafariExtensionManager.getStateOfSafariExtension(
            withIdentifier: "me.shld.shieldmail.macos.extension"
        ) { state, _ in
            DispatchQueue.main.async {
                self.extensionEnabled = state?.isEnabled ?? false
            }
        }
    }

    private func openSafariPreferences() {
        SFSafariApplication.showPreferencesForExtension(
            withIdentifier: "me.shld.shieldmail.macos.extension"
        ) { _ in }
    }
}

private struct StepRow: View {
    let number: Int
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(Color(NSColor.controlBackgroundColor))
                    .frame(width: 28, height: 28)
                Text("\(number)")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

#Preview {
    ContentView()
}
