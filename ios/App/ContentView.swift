import SwiftUI
import StoreKit

/// Container app — onboarding + feature guide + subscription management.
struct ContentView: View {

    @StateObject private var subscriptionManager = SubscriptionManager()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 28) {
                    // Hero
                    VStack(spacing: 10) {
                        // Shield icon (SF Symbol fallback — real icon in AppIcon)
                        Image(systemName: "shield.checkered")
                            .font(.system(size: 56, weight: .medium))
                            .foregroundStyle(Color(red: 0, green: 0.831, blue: 0.667))
                            .padding(.top, 52)

                        Text("ShieldMail")
                            .font(.largeTitle.bold())

                        Text("탭 한 번으로 임시 이메일 생성 + 인증 코드 자동 수신")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                    }

                    // Subscription section
                    SubscriptionSection(manager: subscriptionManager)

                    // How it works
                    VStack(alignment: .leading, spacing: 20) {
                        Text("이렇게 동작합니다")
                            .font(.headline)
                            .padding(.horizontal, 24)

                        FeatureRow(
                            icon: "shield.lefthalf.filled",
                            color: Color(red: 0, green: 0.831, blue: 0.667),
                            title: "방패 버튼 탭",
                            detail: "가입 페이지의 이메일 입력칸에 방패 아이콘이 나타납니다.\n탭하면 임시 이메일 주소가 자동으로 입력됩니다."
                        )

                        FeatureRow(
                            icon: "envelope.badge",
                            color: .blue,
                            title: "인증 코드 자동 수신",
                            detail: "사이트에서 보낸 인증 코드를 자동으로 감지합니다.\n숫자, 영문, 하이픈 등 어떤 형식이든 추출합니다."
                        )

                        FeatureRow(
                            icon: "number.square",
                            color: .orange,
                            title: "코드 자동 입력 또는 토스트 표시",
                            detail: "코드 입력칸이 하나면 자동 입력됩니다.\n한 칸씩 분리된 필드는 화면에 코드가 표시되어\n보고 직접 입력할 수 있습니다."
                        )

                        FeatureRow(
                            icon: "link",
                            color: .purple,
                            title: "인증 링크 자동 열기",
                            detail: "코드 대신 인증 링크를 보내는 사이트는\n자동으로 새 탭에서 링크가 열립니다."
                        )

                        FeatureRow(
                            icon: "clock.badge.checkmark",
                            color: .gray,
                            title: "자동 만료",
                            detail: "임시 이메일 주소는 1시간 후 자동 삭제됩니다.\n메일 내용은 10분 후 자동 삭제됩니다."
                        )
                    }

                    Divider().padding(.horizontal, 24)

                    // Setup
                    VStack(alignment: .leading, spacing: 16) {
                        Text("처음 사용하기")
                            .font(.headline)
                            .padding(.horizontal, 24)

                        SetupStep(number: 1, title: "Safari 설정 열기",
                                  detail: "설정 → Safari → 확장 프로그램")
                        SetupStep(number: 2, title: "ShieldMail 켜기",
                                  detail: "토글 ON + \"모든 웹사이트 허용\" 선택")
                        SetupStep(number: 3, title: "아무 가입 페이지 방문",
                                  detail: "이메일 입력칸 근처에 방패 아이콘이 나타납니다")
                    }

                    // Privacy
                    VStack(spacing: 6) {
                        Label("개인정보 보호", systemImage: "lock.shield")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                        Text("이메일 내용은 저장하지 않습니다.\nOTP와 링크만 10분간 메모리에 보관 후 자동 삭제됩니다.\n비밀번호, 개인정보는 절대 수집하지 않습니다.")
                            .font(.caption2)
                            .foregroundStyle(Color(.tertiaryLabel))
                            .multilineTextAlignment(.center)
                    }
                    .padding(.horizontal, 24)

                    Divider().padding(.horizontal, 24)

                    // Legal
                    VStack(spacing: 12) {
                        LegalLink(title: "개인정보 처리방침", url: "https://moonkj.github.io/shieldmail/privacy.html")
                        LegalLink(title: "이용약관", url: "https://moonkj.github.io/shieldmail/terms.html")
                        LegalLink(title: "지원 및 문의", url: "https://moonkj.github.io/shieldmail/support.html")
                        LegalLink(title: "오픈소스 라이선스", url: "https://github.com/moonkj/shieldmail")
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 40)
                }
            }
            .navigationBarHidden(true)
        }
        .task {
            await subscriptionManager.loadProducts()
            await subscriptionManager.checkEntitlements()
            subscriptionManager.listenForUpdates()
        }
    }
}

// MARK: - Subscription Section

private struct SubscriptionSection: View {

    @ObservedObject var manager: SubscriptionManager

    var body: some View {
        VStack(spacing: 14) {
            // Current plan badge
            HStack(spacing: 8) {
                Image(systemName: manager.tier == "pro" ? "crown.fill" : "person.crop.circle")
                    .foregroundStyle(manager.tier == "pro" ? .yellow : .secondary)
                Text(manager.tier == "pro" ? "Pro 구독 중" : "Free 플랜")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if manager.tier == "pro" {
                    Button("구독 관리") {
                        Task { await manager.showManageSubscriptions() }
                    }
                    .font(.caption)
                    .foregroundStyle(.blue)
                }
            }
            .padding(.horizontal, 24)

            if manager.tier != "pro" {
                // Upgrade button
                Button {
                    Task {
                        try? await manager.purchase()
                    }
                } label: {
                    HStack {
                        Image(systemName: "crown.fill")
                        Text("Pro 구독하기")
                            .fontWeight(.semibold)
                        Text("· 월 \(manager.displayPrice)")
                            .fontWeight(.regular)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Color(red: 0, green: 0.831, blue: 0.667))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(manager.isLoading)
                .padding(.horizontal, 24)

                // Restore button
                Button {
                    Task { await manager.restore() }
                } label: {
                    Text("이전 구매 복원")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .disabled(manager.isLoading)
            }

            // Loading indicator
            if manager.isLoading {
                ProgressView()
                    .padding(.top, 4)
            }

            // Error message
            if let error = manager.errorMessage {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 24)
                    .onAppear {
                        // Auto-dismiss after 5 seconds
                        DispatchQueue.main.asyncAfter(deadline: .now() + 5) {
                            if manager.errorMessage == error {
                                manager.errorMessage = nil
                            }
                        }
                    }
            }
        }
        .padding(.vertical, 16)
        .background(Color(.systemGray6).opacity(0.6))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .padding(.horizontal, 16)
    }
}

// MARK: - Feature Row

private struct FeatureRow: View {
    let icon: String
    let color: Color
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 22))
                .foregroundStyle(color)
                .frame(width: 36, height: 36)

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.horizontal, 24)
    }
}

// MARK: - Setup Step

private struct SetupStep: View {
    let number: Int
    let title: String
    let detail: String

    var body: some View {
        HStack(alignment: .top, spacing: 14) {
            ZStack {
                Circle()
                    .fill(Color(.systemGray5))
                    .frame(width: 30, height: 30)
                Text("\(number)")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(Color(.secondaryLabel))
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 24)
    }
}

// MARK: - Legal Link

private struct LegalLink: View {
    let title: String
    let url: String

    var body: some View {
        Button {
            if let url = URL(string: url) {
                UIApplication.shared.open(url)
            }
        } label: {
            HStack {
                Text(title)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.caption2)
                    .foregroundStyle(Color(.tertiaryLabel))
            }
        }
    }
}

#Preview {
    ContentView()
}
