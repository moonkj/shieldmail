# App Store Review Notes — ShieldMail

> **사용 방법**: App Store Connect 제출 시 "Notes for Reviewer" 란에 아래 영문 텍스트를 복사하세요.
> 한국어 버전은 로컬라이제이션 참고용입니다.

---

## English (Submit to App Store Connect)

```
NOTES FOR REVIEWER — ShieldMail Safari Extension

ShieldMail is a Safari Web Extension that reduces signup friction by generating
temporary email aliases and surfacing OTP codes / verification links from
incoming emails directly in the browser.

━━━ WHY WE NEED host_permissions: https://*/* ━━━

Our content script performs heuristic signup-form detection on every page the
user visits. The detection uses 12 local signals (email field presence, heading
text, URL path keywords, form structure) and runs entirely in the browser — no
page content is ever transmitted to our servers.

Restricting to specific domains is not viable because users sign up on thousands
of different sites. The permission is necessary to:
  1. Detect signup forms on any website
  2. Inject a shield icon next to email input fields
  3. Fill the field with a generated temporary alias on user tap

We cannot achieve this with activeTab alone because multi-step signup flows
(SPA navigation) require MutationObserver across page transitions.

━━━ DATA PRIVACY ━━━

✓ NO email body stored — our backend (Cloudflare Worker) receives emails,
  extracts only the OTP code (6–8 digits) and verification links via regex,
  and immediately discards the raw message. No subject, sender, or body is
  persisted.

✓ OTP/links live in server memory (Durable Object) for ≤10 minutes, then are
  automatically deleted via setAlarm(). This is enforced at the API layer, not
  just the client.

✓ NO analytics, tracking pixels, or crash reporting of any kind.

✓ Browsing data (page URL, heading text) is evaluated locally and never leaves
  the device. The extension sends only: alias mode, origin domain, and page title
  to generate an alias — no page content.

✓ Keychain (iOS): the extension stores JWT poll tokens and a list of max 3
  recent alias addresses in the iOS Keychain, encrypted at rest and never
  transmitted.

━━━ USER CONTROLS ━━━

• Enable/disable the extension any time in Settings > Safari > Extensions
• Delete all aliases in the ShieldMail app
• Ephemeral mode (default): aliases expire automatically in 1 hour
• Managed mode (opt-in): user-selected aliases, deleted when user removes them
• Privacy footer is permanently visible in the extension popup:
  "Email contents are never stored. Only OTP and links are kept in memory for
   10 minutes, then automatically deleted."

━━━ TECHNICAL SAFEGUARDS ━━━

• ESLint custom rule `no-persist-raw-email` prevents raw email data from
  reaching any KV or DO storage call (enforced at CI).
• `sanitizeDoPayload()` whitelist throws at runtime if any field outside
  {otp, confidence, verifyLinks, receivedAt} reaches the storage layer.
• Privacy manifest (PrivacyInfo.xcprivacy) declares all accessed data types.
• GitHub public repository — auditable build.

━━━ TEST ACCOUNT ━━━

No account required. The extension works without login:
  1. Open any signup page (e.g., a newsletter or forum)
  2. Tap the shield icon next to the email field
  3. A temporary alias is generated and filled automatically

For OTP flow testing, use our demo page: https://demo.shld.me/signup
(sends a real 6-digit OTP to the generated alias within 30 seconds)

Contact: support@shld.me
```

---

## 한국어 참고 버전

```
심사자 주석 — ShieldMail Safari 확장 프로그램

ShieldMail은 임시 이메일 별칭을 생성하고 수신 이메일에서 OTP 코드 및 인증 링크를
브라우저에서 직접 표시함으로써 가입 피로도를 줄이는 Safari 웹 확장 프로그램입니다.

━━━ host_permissions: https://*/* 가 필요한 이유 ━━━

content script는 사용자가 방문하는 모든 페이지에서 가입 폼 감지를 수행합니다.
감지는 12개의 로컬 신호(이메일 필드 존재 여부, 제목 텍스트, URL 경로 키워드,
폼 구조)를 사용하며 브라우저 내에서만 실행됩니다. 페이지 콘텐츠는 서버로
전송되지 않습니다.

특정 도메인으로 제한하는 것은 불가능합니다. 사용자는 수천 개의 다른 사이트에서
가입하기 때문입니다. 권한이 필요한 이유:
  1. 어느 웹사이트에서나 가입 폼 감지
  2. 이메일 입력 필드 옆에 방패 아이콘 주입
  3. 사용자 탭 시 생성된 임시 별칭으로 필드 채우기

SPA 내비게이션을 통한 다단계 가입 흐름은 페이지 전환에 걸쳐 MutationObserver가
필요하므로 activeTab만으로는 구현할 수 없습니다.

━━━ 데이터 프라이버시 ━━━

✓ 이메일 본문 저장 없음 — 백엔드(Cloudflare Worker)는 이메일을 수신하여 정규식으로
  OTP 코드(6~8자리)와 인증 링크만 추출하고 원본 메시지를 즉시 폐기합니다.
  제목, 발신자, 본문은 저장되지 않습니다.

✓ OTP/링크는 서버 메모리(Durable Object)에 최대 10분간 보관 후 setAlarm()으로
  자동 삭제됩니다. API 레이어에서 강제 적용됩니다.

✓ 분석, 추적 픽셀, 오류 보고가 전혀 없습니다.

✓ 브라우징 데이터(페이지 URL, 제목 텍스트)는 로컬에서 평가되며 기기를 벗어나지
  않습니다.

✓ Keychain(iOS): 확장 프로그램은 JWT 폴 토큰과 최대 3개의 최근 별칭 주소를
  iOS Keychain에 암호화하여 저장하며, 전송하지 않습니다.

━━━ 사용자 제어권 ━━━

• 설정 > Safari > 확장 프로그램에서 언제든 활성화/비활성화
• ShieldMail 앱에서 모든 별칭 삭제
• 일회성 모드(기본값): 별칭 1시간 후 자동 만료
• 저장 모드(선택사항): 사용자가 선택한 별칭, 사용자가 제거할 때 삭제
• 확장 팝업에 프라이버시 안내 항상 표시

━━━ 기술적 안전장치 ━━━

• ESLint 커스텀 룰로 원본 이메일이 스토리지에 도달하는 것을 방지
• sanitizeDoPayload() 화이트리스트가 허용되지 않은 필드를 런타임에 차단
• PrivacyInfo.xcprivacy로 모든 접근 데이터 유형 선언
• GitHub 공개 저장소 — 감사 가능한 빌드

━━━ 테스트 계정 ━━━

계정 불필요. 확장 프로그램은 로그인 없이 작동합니다.
  1. 가입 페이지 열기
  2. 이메일 필드 옆 방패 아이콘 탭
  3. 임시 별칭이 자동 생성되어 입력됨

OTP 흐름 테스트: https://demo.shld.me/signup
(30초 이내 생성된 별칭으로 실제 6자리 OTP 전송)

문의: support@shld.me
```

---

## App Store Connect Privacy Details 체크리스트

| 데이터 종류 | 수집 여부 | 사용자와 연결 | 추적 | 목적 |
|---|---|---|---|---|
| Browsing History | ✅ 수집 | ❌ 미연결 | ❌ 추적 없음 | 가입 폼 감지 (로컬 전용) |
| Emails | ✅ 수집 | ❌ 미연결 | ❌ 추적 없음 | OTP/링크 추출 (10분 후 삭제) |
| Identifiers | ❌ 미수집 | — | — | — |
| Location | ❌ 미수집 | — | — | — |
| Contact Info | ❌ 미수집 | — | — | — |
| Usage Data | ❌ 미수집 | — | — | — |
| Diagnostics | ❌ 미수집 | — | — | — |
| Financial Info | ❌ 미수집 | — | — | — |
| Health & Fitness | ❌ 미수집 | — | — | — |
| Sensitive Info | ❌ 미수집 | — | — | — |
| Purchases | ❌ 미수집 | — | — | — |

---

## 리젝 리스크 평가

| 리스크 항목 | 수준 | 완화 방법 |
|---|---|---|
| `host_permissions: https://*/*` | 🟡 중간 | Review Notes + Privacy Policy 명시 |
| 콘텐츠 스크립트 광범위 실행 | 🟡 중간 | "로컬 전용, 서버 미전송" 명시 |
| Keychain 접근 | 🟢 낮음 | Apple 표준 API, entitlements 명확 |
| 백그라운드 폴링 | 🟢 낮음 | 사용자 생성 alias ID에만 작동 |

**종합 승인 예상**: 80~85% (Review Notes + Privacy Policy 완비 시)
