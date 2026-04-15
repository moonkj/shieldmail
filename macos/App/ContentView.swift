import SwiftUI
import SafariServices
import StoreKit

/// Container app — feature guide + subscription + legal (macOS).
struct ContentView: View {
    @State private var extensionEnabled = false
    @StateObject private var subscriptionManager = SubscriptionManager()

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // Hero
                VStack(spacing: 10) {
                    Image(systemName: "shield.checkered")
                        .font(.system(size: 48, weight: .medium))
                        .foregroundStyle(Color(red: 0, green: 0.831, blue: 0.667))
                        .padding(.top, 24)

                    Text("ShieldMail")
                        .font(.largeTitle.bold())

                    Text("탭 한 번으로 임시 이메일 생성 + 인증 코드 자동 수신")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                // Extension status
                statusBanner

                // Subscription
                SubscriptionSection(manager: subscriptionManager)

                // Features
                VStack(alignment: .leading, spacing: 16) {
                    Text("이렇게 동작합니다")
                        .font(.headline)

                    FeatureRow(icon: "shield.lefthalf.filled", color: Color(red: 0, green: 0.831, blue: 0.667),
                               title: "방패 버튼 클릭",
                               detail: "가입 페이지의 이메일 입력칸에 방패 아이콘이 나타납니다.\n클릭하면 임시 이메일 주소가 자동으로 입력됩니다.")
                    FeatureRow(icon: "envelope.badge", color: .blue,
                               title: "인증 코드 자동 수신",
                               detail: "사이트에서 보낸 인증 코드를 자동으로 감지합니다.\n숫자, 영문, 하이픈 등 어떤 형식이든 추출합니다.")
                    FeatureRow(icon: "number.square", color: .orange,
                               title: "코드 자동 입력 또는 토스트 표시",
                               detail: "코드 입력칸이 하나면 자동 입력됩니다.\n분리된 필드는 화면에 코드가 표시됩니다.")
                    FeatureRow(icon: "link", color: .purple,
                               title: "인증 링크 자동 열기",
                               detail: "코드 대신 인증 링크를 보내는 사이트는\n자동으로 새 탭에서 링크가 열립니다.")
                    FeatureRow(icon: "clock.badge.checkmark", color: .gray,
                               title: "자동 만료",
                               detail: "임시 이메일은 1시간 후 자동 삭제됩니다.\n메일 내용은 10분 후 자동 삭제됩니다.")
                }
                .padding(.horizontal, 24)

                Divider().padding(.horizontal, 24)

                // Setup
                VStack(alignment: .leading, spacing: 12) {
                    Text("처음 사용하기")
                        .font(.headline)

                    StepRow(number: 1, title: "Safari 확장 프로그램 환경설정 열기",
                            detail: "아래 버튼을 누르거나 Safari → 설정 → 확장 프로그램")
                    StepRow(number: 2, title: "ShieldMail 활성화",
                            detail: "체크박스를 켜고 모든 웹사이트 접근을 허용")
                    StepRow(number: 3, title: "회원가입 폼에서 방패 아이콘 클릭",
                            detail: "이메일 필드 옆에 방패 아이콘이 자동으로 나타납니다")
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

                // Privacy
                VStack(spacing: 6) {
                    Label("개인정보 보호", systemImage: "lock.shield")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text("이메일 내용은 저장하지 않습니다.\nOTP와 링크만 10분간 메모리에 보관 후 자동 삭제됩니다.")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .multilineTextAlignment(.center)
                }

                Divider().padding(.horizontal, 24)

                // Legal
                VStack(spacing: 8) {
                    LegalLink(title: "개인정보 처리방침", url: "https://moonkj.github.io/shieldmail/privacy.html")
                    LegalLink(title: "이용약관", url: "https://moonkj.github.io/shieldmail/terms.html")
                    LegalLink(title: "지원 및 문의", url: "https://moonkj.github.io/shieldmail/support.html")
                    LegalLink(title: "오픈소스 라이선스", url: "https://github.com/moonkj/shieldmail")
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 24)
            }
            .padding()
        }
        .frame(minWidth: 420, minHeight: 600)
        .task {
            checkExtensionStatus()
            await subscriptionManager.loadProducts()
            await subscriptionManager.checkEntitlements()
            subscriptionManager.listenForUpdates()
        }
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
        .background(RoundedRectangle(cornerRadius: 10).fill(Color(NSColor.controlBackgroundColor)))
        .padding(.horizontal, 24)
    }

    private func checkExtensionStatus() {
        SFSafariExtensionManager.getStateOfSafariExtension(
            withIdentifier: "me.shld.shieldmail.macos.extension"
        ) { state, _ in
            DispatchQueue.main.async { extensionEnabled = state?.isEnabled ?? false }
        }
    }

    private func openSafariPreferences() {
        SFSafariApplication.showPreferencesForExtension(
            withIdentifier: "me.shld.shieldmail.macos.extension"
        ) { _ in }
    }
}

// MARK: - Subscription Section

private struct SubscriptionSection: View {
    @ObservedObject var manager: SubscriptionManager

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: manager.tier == "pro" ? "crown.fill" : "person.crop.circle")
                    .foregroundStyle(manager.tier == "pro" ? .yellow : .secondary)
                Text(manager.tier == "pro" ? "Pro 구독 중" : "Free 플랜")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if manager.tier == "pro" {
                    Button("구독 관리") { manager.showManageSubscriptions() }
                        .font(.caption).foregroundStyle(.blue)
                }
            }

            if manager.tier != "pro" {
                Button {
                    Task { try? await manager.purchase() }
                } label: {
                    HStack {
                        Image(systemName: "crown.fill")
                        Text("Pro 구독하기").fontWeight(.semibold)
                        Text("· 월 \(manager.displayPrice)").fontWeight(.regular)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(Color(red: 0, green: 0.831, blue: 0.667))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)
                .disabled(manager.isLoading)

                Button { Task { await manager.restore() } } label: {
                    Text("이전 구매 복원").font(.caption).foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
                .disabled(manager.isLoading)
            }

            if manager.isLoading { ProgressView().controlSize(.small) }
            if let error = manager.errorMessage {
                Text(error).font(.caption).foregroundStyle(.red)
            }
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 12).fill(Color(NSColor.controlBackgroundColor).opacity(0.6)))
        .padding(.horizontal, 24)
    }
}

// MARK: - Feature Row

private struct FeatureRow: View {
    let icon: String; let color: Color; let title: String; let detail: String
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon).font(.system(size: 20)).foregroundStyle(color).frame(width: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Setup Step

private struct StepRow: View {
    let number: Int; let title: String; let detail: String
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            ZStack {
                Circle().fill(Color(NSColor.controlBackgroundColor)).frame(width: 26, height: 26)
                Text("\(number)").font(.system(size: 12, weight: .semibold)).foregroundStyle(.secondary)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
    }
}

// MARK: - Legal Link

private struct LegalLink: View {
    let title: String; let url: String
    var body: some View {
        Button {
            if let url = URL(string: url) { NSWorkspace.shared.open(url) }
        } label: {
            HStack {
                Text(title).font(.caption).foregroundStyle(.secondary)
                Spacer()
                Image(systemName: "arrow.up.right").font(.caption2).foregroundStyle(.tertiary)
            }
        }
        .buttonStyle(.plain)
    }
}

#Preview { ContentView() }
