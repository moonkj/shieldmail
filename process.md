# ShieldMail — Process Log

> 리더(Architect)가 구현 단계마다 업데이트하는 진행 기록.

---

## 2026-04-08 — Stage 0: 킥오프
- 팀 메모리 저장, Tasklist.md/process.md 초기화. R1 시작.

## 2026-04-08 — R1: UX + Architect 병렬 리서치
- 4개 에이전트 동시 가동 → ARCHITECTURE.md 통합
- 4개 논쟁 해결 (D1~D4)
- 커밋: `9f30dad docs: R1 initial design`

## 2026-04-08 — R2: M1 Worker 구현 (7 라운드 품질 사이클)
- Coder R1 → Debugger → Coder R2 → Test Engineer (118) → Reviewer R1 🔁 → Coder R3 IMP-1~5 → Reviewer R2 ✅
- 핵심 성과: privacy choke point 100% 통과, multilang OTP, DO alarm race fix, DI seam
- 커밋: `17de6bf feat(workers): M1 email router`

## 2026-04-08 — R3: M2 Safari Extension (6 에이전트 병렬)

### Wave 1 (병렬)
- **UX Designer**: `docs/UX_SPEC.md` 방패 모드 격상, 10개 섹션, Mermaid 4개
- **Icon Designer**: `assets/icons/` 7 파일, 방패+봉투 concept, WCAG AAA 대비비

### Wave 2: Architect 스캐폴드
- `extension/` package.json, tsconfig, vite, manifest v3, tokens.css, lib/types.ts

### Wave 3 (병렬 3 Coders)
- **Coder A (Content)**: detection 12 signals + scorer gates + injector + observer
- **Coder B (Background)**: SW + API client + poller + storage + notify + handlers
- **Coder C (Popup)**: Preact app + 4 screens + 10 components + i18n

### Wave 4: Debugger — 🔁 R2 필요
- BLOCKER 3: storage shape 불일치, ack 미호출, manifest 권한 누락
- HIGH 6: accumulation, return true, onboardingCompleted, tags 부재, tokenRevoked, SW eviction

### Wave 4.5: 리더 frozen 파일 수정 + 3 Coder R2 병렬
- 리더 (Architect): `types.ts` + `messaging.ts` + `manifest.json` 직접 편집
- Coder A R2: FIX-A1/A2/A3 (FORCE_INJECT 리시버, SPA fallback, InputEvent)
- Coder B R2: FIX-B1/B2/B3/B4/B5 (라우팅, chrome.alarms, 브로드캐스트, rehydrate, PING/PONG)
- Coder C R2: FIX-C1/C2/C3/C4/C5 (Record→Array, ACK, merge-by-id, tags filter, PONG listener)

### 과학적 토론 4건 (R3 신규)
- **D5 storage shape**: BG는 Record 유지 (쓰기 효율), Popup은 읽을 때 `Object.values` 정규화
- **D6 ack 트리거**: unmount 불신뢰 → copy 성공 또는 verify 링크 클릭 시점
- **D7 폴러 SW lifecycle**: chrome.alarms 주 경로 + 6s hot setTimeout 병행
- **D8 OS 알림 프라이버시**: OTP 평문 알림 금지 (lead hotfix)

### Wave 5: Test Engineer — 97 tests
- 9 files (signals, scorer, forms, keywords, api, OtpBox, ErrorCard, PrivacyFooter, + fixtures)
- R2 회귀 단언: 로그인 페이지 거부, token_revoked, ack 트리거, alias expired
- 5 관찰 보고 (4건 ACCEPT, 1건 FIX LATER)

### Wave 6: Reviewer — ✅ M2 최종 완료
- 점수 평균 4.5/5, 프라이버시 4.5/5
- Test Engineer 5건 관찰 판정 완료
- 2 MAJOR 백로그 권고 → 리더가 즉시 핫픽스로 적용

### Lead Hotfix (Reviewer 권고 중 프라이버시 즉시 적용)
- **notify.ts:33-52**: OS 알림 본문에서 OTP 제거. `"${aliasAddress}\n코드: ${otp}"` → `"${aliasAddress}\n클릭하여 확인"`. macOS/iOS Notification Center 영구 저장 방지 (UX_SPEC §6 준수).
- **injector.ts:48-52, 249-250**: 전역 window keydown 리스너 제거. 단축키는 manifest commands → background → FORCE_INJECT 단일 경로로 일원화. generate API 중복 호출 방지.

### 교차 레이어 영향 (R3)
- `types.ts` `AliasRecord.tags?` 추가 → Managed Mode tag 필터 정상 작동
- `messaging.ts` `PingMessage/PongMessage` 확장 → 팝업 liveness 정확 감지
- `manifest.json` permissions 확장 → notifications/clipboardWrite/alarms 정상 작동
- `chrome.alarms` 도입 → SW eviction 내성 확보, M4 SSE 마이그레이션 시 제거 가능

### R3 최종 산출물
- `docs/UX_SPEC.md` (UX 사양서)
- `assets/icons/` 7 파일 (SVG 로고/아이콘)
- `extension/` 60+ files (content + background + popup + tests)
- `Tasklist.md` + `process.md` 업데이트

## 2026-04-08 — R4: M2 백로그 + O5 Alias 충돌 수정

### 리더 판단: M3 진입 전 필수 정리 완료
- M2-bk1: `injector.ts` `resolveShortcut()` — 플랫폼 감지 후 기본값 분기 (`⌘⇧E` / `Ctrl+Shift+E`)
- M2-bk2: `PrivacyFooter.tsx` — interval 내부에서 만료 시 `clearInterval` 즉시 호출 (음수 TTL 무한 반복 방지)
- M2-bk3: `forms.ts` — SPA walk-up fallback 주석 정정 (div 1차 제외, 2차 walk-up은 허용 명시)
- M2-bk4: `injector.ts` `triggerFirstVisible()` — dead code 제거 (FORCE_INJECT 경로는 `forceInjectAndGenerate` 직접 호출)

### O5 alias 충돌 확률 수학적 증명 결과
- **기존 10자(40비트)**: Birthday Problem → 500만 alias 시 충돌 확률 ~99.99% (필연)
- **신규 14자(56비트, 2^56 ≈ 7.2경)**: 1000만 alias 시 ~0.07% — M4 규모까지 안전
- `alias.ts`: `slice(0, 10)` → `slice(0, 14)` 변경
- `router.ts`: KV 충돌 감지 + 최대 3회 재시도 로직 추가 (실패 시 503)
- 테스트: `alias.test.ts`, `router.test.ts` 정규식 + 설명 14자로 업데이트

## 2026-04-08 — R5: M3 iOS Safari Extension (진행중)

### Wave 1-3: 병렬 구현 완료

#### Swift Native Container (`ios/`)
- `project.yml` — XcodeGen 설정 (ShieldMail App + ShieldMailExtension 2 타겟)
- `App/AppDelegate.swift` + `SceneDelegate.swift` — minimal app lifecycle
- `App/ContentView.swift` — SwiftUI "Safari에서 활성화" 온보딩 안내 (SFSafariExtensionManager 상태 감지)
- `App/Info.plist` + `ShieldMail.entitlements` — Keychain Access Group `me.shld.shieldmail`
- `Extension/SafariExtensionHandler.swift` — JS↔Swift 메시지 라우팅 (haptic/storeToken/getToken/storeAliases/getAliases)
- `Extension/KeychainBridge.swift` — pollToken + 최근 alias 3개 Keychain 저장/조회 (kSecClassGenericPassword)
- `Extension/HapticBridge.swift` — UIImpactFeedbackGenerator / UINotificationFeedbackGenerator 래퍼
- `Extension/Info.plist` + `ShieldMailExtension.entitlements`

#### iOS 전용 TypeScript (`extension/src/content/`)
- `ios-bridge.ts` — safari.extension.dispatchMessage 래퍼 (haptic/storeToken/loadToken/appendRecentAlias)
- `ios-injector.ts` — IOSFloatingButtonInjector (fixed 56×56px, visualViewport 키보드 추적, 6 states, haptic)
- `index.ts` 업데이트 — isIOS() 분기: iOS→mainIOS() / macOS→mainMacOS() (focusin 추적 추가)

#### 테스트
- `test/ios-injector.test.ts` — 18 test cases (mount, state, generation, error, forceGenerate, guards)

### 플랫폼 분기 전략
- `isIOS()`: `/iPhone|iPad|iPod/.test(navigator.userAgent)` + `navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1` (iPadOS 13+)
- iOS: `IOSFloatingButtonInjector` (fixed bottom-right, visualViewport 키보드 감지)
- macOS: `ShieldIconInjector` (inline, 기존 코드 유지)

### 교차 레이어 영향 (M3)
- `extension/src/content/index.ts` — iOS/macOS 분기 추가, focusin 이벤트 리스너 (iOS path)
- Keychain Access Group `me.shld.shieldmail` — App + Extension 공유

### Wave 4: Debugger — BLOCKER 2건 + HIGH 1건 수정
- BLOCKER-1: `ios-bridge.ts loadToken` — `document.addEventListener` → `chrome.runtime.onMessage`로 교체 (Safari `dispatchMessageToScript` 채널 수정)
- BLOCKER-2: `index.ts iOS FORCE_INJECT` — `{ type: "FORCE_INJECT" }` + `{ name: "FORCE_INJECT" }` 양쪽 shape 허용
- HIGH: `SafariExtensionHandler.swift storeAliases` — `storeRecentAliases(aliases)` → `appendRecentAlias(first)` 교정

### Wave 5: Test Engineer — 테스트 3파일 추가
- `test/ios-platform.test.ts` — isIOS() 로직 14 cases (iPhone/iPad/iPadOS/macOS/boundary)
- `test/ios-bridge.test.ts` — ios-bridge.ts 전체 커버 (haptic/storeToken/appendRecentAlias/loadToken)
- `test/ios-injector.test.ts` 추가 케이스 — position null fallback, done→hidden 1200ms, error→default 2000ms

### Wave 6: Reviewer — ✅ M3 최종 승인 (보완 후 재승인)
- 점수: 기능 4.5/5, 프라이버시 5/5, 안정성 4/5, iOS 호환 4.5/5, macOS 영향 5/5
- Reviewer MAJOR: iPad split view `position:fixed` right offset 수정
  - `right` 정적 CSS (`12px`) 고정 — `position:fixed`는 이미 visual viewport 기준
  - `bottom`만 `keyboardOffset + 8px` 동적 계산으로 단순화

### R5 최종 산출물
- `ios/` — 8 Swift 파일 (App 4 + Extension 4) + `project.yml`
- `extension/src/content/ios-bridge.ts`, `ios-injector.ts` — iOS 전용 TypeScript
- `extension/src/content/index.ts` — iOS/macOS 분기
- `extension/test/ios-platform.test.ts`, `ios-bridge.test.ts`, `ios-injector.test.ts` 보강

### 다음 단계
- **O2** 선행 처리 후 **M4** 착수

## 2026-04-08 — R6: O2 App Store 리젝 리스크 해소

### 리더 판단: M4 전 O2 선행 처리
`host_permissions: https://*/*` 리젝 리스크 ~20% → ~5%로 감소. M5 릴리즈 경로 확보.

### 산출물
- `ios/Extension/PrivacyInfo.xcprivacy` — Apple Privacy Manifest
  - NSPrivacyTracking: false
  - NSPrivacyCollectedDataTypes: BrowsingHistory(로컬 전용) + EmailsOrTextMessages(10분 메모리)
  - NSPrivacyAccessedAPITypes: UserDefaults CA92.1
  - project.yml 리소스에 포함

- `docs/APP_STORE_REVIEW_NOTES.md` — 영문 + 한국어 Review Notes 초안
  - host_permissions 기술적 필요성, 프라이버시 보호 5가지, 테스트 방법

- `docs/PRIVACY_POLICY.md` — Privacy Policy 전문
  - 수집/미수집 분리, 10분 자동 삭제, 제3자: Cloudflare only, 사용자 권리

### 다음 단계
- **M4** — SSE/WS 마이그레이션 + 도메인 로테이션 2→5개 + Managed Mode 고도화
- **Xcode 프로젝트 생성** — `brew install xcodegen && xcodegen generate`
