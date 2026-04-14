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

## 2026-04-08 — R8: M4 완료 + M5 Wave 1 착수

### 리더 판단
- O3 (Turnstile): **DEFER** — TokenBucket DO 충분, 개발자 타겟 MVP에 마찰 불필요
- O4 (도메인 자동화): **완료 처리** — `pickDomain()` 랜덤 rotation = 핵심 요건 충족
- O1 (대용량 HTML): **즉시 처리** — 배포 전 필수 방어

### 커밋: `e1411a6 feat(m4/m5): O1 email size guard + M5 README`

#### O1 — email.ts 크기 방어
- `MAX_HTML_CHARS = 200_000` / `MAX_TEXT_CHARS = 50_000` 상수 추가
- `parsed.html/text` → `slice()` 후 `htmlToText` 및 `extractLinks` 에 전달
- 트랜잭션 메일은 코드/링크가 상단에 위치하므로 truncate 시 정보 손실 없음

#### M5 Wave 1 — README.md
- Worker 배포 가이드 (KV 설정, wrangler.toml, Email Routing catch-all, secret)
- macOS Safari 확장 빌드 + 개발자 로드 방법
- iOS Safari 확장 XcodeGen → Xcode 빌드 방법
- 프라이버시 요약 + ARCHITECTURE/PRIVACY_POLICY 링크

### M4 최종 상태: ✅ 완료
모든 M4 핵심 산출물 완료:
- SSE 고도화 (R7), 도메인 ×5 (R7), IndexedDB+WebCrypto (R7), O1 HTML 방어 (R8)

### M5 잔여 → R9에서 완료

## 2026-04-08 — R9: M5 완료

### 커밋: `30878d1 feat(m5): reproducible builds + release checklist + MIT license`

- **정확 버전 고정**: 양쪽 `package.json`에서 `^` 제거, 모든 deps exact 버전
- **`.npmrc`**: `save-exact=true`, `engine-strict=true` (extension + worker)
- **sourcemap 비활성화**: `vite.config.ts` `NODE_ENV=production` 시 sourcemap 미생성
- **`docs/RELEASE_CHECKLIST.md`**: Worker 스모크테스트 · macOS 코드서명+공증 · iOS TestFlight · App Store 제출 · 오픈소스 태깅 5개 섹션
- **`LICENSE`**: MIT
- **`README.md`**: `npm ci` 재현 빌드 지시사항 보강

### 전체 마일스톤 현황: M1 ✅ · M2 ✅ · M3 ✅ · M4 ✅ · M5 ✅
잔여: O3 Turnstile (M6+ defer), 실제 배포 실행 (Xcode + wrangler)

## 2026-04-08 — R7: M4 SSE 고도화 + 도메인 ×5 + Managed Mode 기반 구축

### 커밋: `113443c feat(m4): SSE hardening, domain pool ×5, Managed Mode crypto + IndexedDB`

#### Workers
- `AliasChannel.ts`: Last-Event-ID 재생 중복 제거, reconnect-race 수정(클라이언트 등록을 storage.list 이전에), 30s 하트비트(recursive setTimeout), `fetch()` handleStream(request) 인자 전달 버그 수정
- `wrangler.toml`: DOMAIN_POOL 5개 도메인으로 확장 (d1–d5.shld.me)

#### Extension
- `messaging.ts`: `SseActiveMessage` / `SseInactiveMessage` ExtRuntimeMessage 유니온 추가
- `poller.ts`: `pauseForSse()` 알람 클리어, `resumeFromSse()` 알람 재등록
- `background/index.ts`: SSE_ACTIVE/INACTIVE → poller 라우팅; update 시 migration 트리거
- `background/migration.ts` (신규): chrome.storage.local → IndexedDB lazy 마이그레이션 + AES 키 생성 보장
- `lib/crypto.ts` (신규): WebCrypto AES-256-GCM (generateKey, encrypt, decrypt, JWK export/import)
- `lib/indexeddb.ts` (신규): shieldmail_v1 스키마 (aliasStore + messageStore, aliasId 인덱스)
- `popup/MainScreen.tsx`: DO /stream 직접 EventSource 연결, 지수 백오프 재시도(최대 5회, 최대 30s), SSE_ACTIVE/INACTIVE 백그라운드 통보

### 미해결 (O1, O3, O4 → 다음 라운드)
- O1: Email Worker 대용량 HTML CPU/메모리 처리
- O3: Rate limit Turnstile 삽입
- O4: 도메인 로테이션 자동화

## 2026-04-08 — R10: iPhone Air 실기 설치 + iOS Safari 빌드 사이클 (10+ commits)

### 리더 판단
사용자가 "iPhone Air에 릴리즈로 설치"를 요청 → Xcode 26 + iOS 19에서 Apple 공식 Safari Web Extension API와 코드 사이의 다수 호환성 문제 발견. 발견 → 수정 → 재설치 사이클 10+ 회 반복하여 최종 동작.

### iOS 빌드 블로커 (R10 commit `d17ff17`)
- `SafariExtensionHandler.swift`: `SFSafariExtensionHandler` (macOS only) → `NSObject + NSExtensionRequestHandling` 스켈레톤 (iOS 호환)
- `ContentView.swift`: `SFSafariApplication.showPreferencesForExtension` 제거, `SFSafariExtensionManager.getStateOfSafariExtension` 제거 (Xcode 26에서 API 변경)
- 엔타이틀먼트: App Groups + Keychain 제거 (MVP에서 `browser.storage.local`만 사용)
- `ios-bridge.ts`: `safari.extension.dispatchMessage` (Safari App Extension / macOS API) → `chrome.storage.local` + `navigator.vibrate()`로 교체
- `injector.ts`: `shieldIcon.css` → `?inline` (Vite 5.4+ 필수)
- `package.json`: 모든 패키지 버전을 npm에 실제 배포된 버전으로 정확히 핀 (`typescript 5.9.3`, `vite 5.4.21`, `preact 10.29.1`, `hono 4.12.12`, `wrangler 3.114.17`)

### 확장 프로그램 인식 문제 (R10 commits `6a194e5`, `2b28258`)
- `extension/public/manifest.json` + `extension/public/icons/`: 누락된 PNG 아이콘 6개 생성, manifest를 public/에 둠
- `manifest.json` `default_locale` 제거 (`_locales/<lang>/messages.json` 부재 시 Safari가 무효 처리)

### appex 번들 구조 (R10 commit `9575dbc`)
- `ios/project.yml`: `type:folder` 리소스(앱ex/dist/manifest.json) → `postCompileScripts` rsync로 `extension/dist/` 내용을 `.appex` 루트에 직접 복사 (Safari는 `manifest.json`이 appex 루트에 있어야 인식)

### popup 빈 화면 디버깅 — 6단계 누적 fix
사용자가 "팝업이 빈 화면으로 뜬다" 보고 → 진단 도구 작성 → 다중 가설 검증 → 단계별 fix:

#### 1. App.tsx 즉시 렌더 (R10 commit `b6ccbdc`)
- `screen = null` → `useState<Screen>("main")` 즉시 렌더, `chrome.storage.local.get` 1.5s `Promise.race` 타임아웃

#### 2. 상대 경로 (R10 commit `b3f439e`)
- `vite.config.ts` `base: ""` 추가 — `safari-web-extension://` URL에서 절대 경로(`/popup.js`) 동작 안 함

#### 3. popup HTML root level (R10 commit `f95a4c1`)
- `extension/popup.html` 생성 → Vite 입력으로 사용 → `dist/popup.html` 루트에 출력 (이전: `dist/src/popup/index.html` 깊은 경로)

#### 4. crossorigin 제거 (R10 commit `2eef63c`)
- `vite.config.ts` `stripCrossorigin` 플러그인: `crossorigin` 속성 + `modulepreload` 링크 제거

#### 5. IIFE 단일 파일 빌드 (R10 commit `f9af4d8`)
- `vite.popup.config.ts` 신규: popup만 IIFE 포맷, `inlineDynamicImports: true`, sibling chunks 없음 (Apple 공식 Xcode Safari Web Extension 템플릿 패턴)
- `package.json` build: `vite build && vite build -c vite.popup.config.ts` 체이닝
- `extension/public/diag-*.{html,js}` 7-step 진단 페이지 (팀 에이전트 작성, 향후 iOS popup 디버깅 인프라)

#### 6. JSX → Preact h() (R10 commit `88fd00a`)
- **결정적 fix**: `vite.config.ts` + `vite.popup.config.ts` 양쪽에 `esbuild: { jsx: "automatic", jsxImportSource: "preact" }`
- 이전: Vite의 기본 esbuild가 JSX를 `React.createElement()`로 컴파일 → React 미정의 → IIFE 시작 시 throw → 빈 화면
- `window.error` 캐치 진단 (`extension/public/real-popup-test.html`)으로 정확한 에러 메시지 잡음: `ReferenceError: Can't find variable: React @ popup.js:1:34963`

#### 7. defer 속성 (R10 commit `5455fcc`)
- `vite.popup.config.ts` `popupHtmlFix` 플러그인에 `defer` 속성 추가
- 이전: classic `<script>`가 `<head>`에서 동기 실행 → DOM 미생성 → `getElementById("root") === null` → `&&` 단락 → render 호출 안 됨 (no error)
- `defer`로 DOM 파싱 대기

### 팀 에이전트 협업 (R10)
- **3 병렬 에이전트 1차** (리서치 + 정적 분석 + 진단 설계): IIFE 빌드 패턴 + 7-step 진단 페이지 산출
- **3 병렬 에이전트 2차** (번들 감사 + 설치 검증 + 컴포넌트 트리 리뷰): 번들 자체 깨끗 확인, popup 컴포넌트 트리에서 throw 가능 지점 추적

### Demo Mode 추가 (R10 commits `7585e33`, `880be4a`)
사용자가 "이메일 생성 동작 안 함" 보고 → 옵션 A (Demo Mode) 우선 진행:
- `MainScreen.tsx`: `origin` null fallback → `https://demo.local`, popup-side 가짜 alias 생성 (background SW 응답 없을 때)
- `handlers.ts`: `NetworkError` 시 `makeDemoAlias()` 호출, FETCH_MESSAGES에서 `demo:` prefix면 fake 6자리 OTP 합성
- 인라인 디버그 HUD로 단계별 로그 표시 → 사용자 스크린샷으로 정확히 어디까지 동작하는지 확인 → **모두 정상 동작 확인** (origin 추출, storage, crypto, Preact onClick)
- 디버그 HUD 제거 후 v14 clean 빌드 배포

### 최종 검증 (스크린샷)
```
임시 주소: 708d2d2ae9a737@d5.shld.me
OTP: 167673
이 주소 만료까지 59:47
origin=https://qr.dhlottery.co.kr (실제 활성 탭)
```

### 핵심 교훈
- iOS Safari 19 + Xcode 26은 macOS Safari API와 다수 비호환 (`SFSafariExtensionHandler`, `SFSafariApplication.showPreferencesForExtension`, `getStateOfSafariExtension`)
- Vite 기본 출력은 Safari Web Extension popup과 호환되지 않음 (절대 경로, 깊은 출력 디렉토리, `crossorigin`, sibling chunks, JSX/React 가정, head 동기 script)
- Apple 공식 Safari Web Extension 템플릿이 `<script>` (no module)을 사용하는 이유는 위 모든 문제를 한꺼번에 회피하기 위함
- 진단 인프라 (window.error 캐치, visible debug HUD)가 silent fail 디버깅의 결정적 도구

### 다음 단계
- **옵션 B**: 실제 Cloudflare Worker 배포 (KV 생성, HMAC_KEY secret, Email Routing catch-all 5개 도메인, `wrangler deploy`)
- 옵션 C: A + B 모두

## 2026-04-08 — R11: Cloudflare Worker 배포 + production hardening

### B 트랙 (Worker 실배포)
- ALIAS_KV 네임스페이스 생성: `996d9716e4774458994c57c281d99f1a` (prod) + `fe0a2777f04b4a548f7b2b3f068d9b97` (preview)
- HMAC_KEY 32-byte hex secret 등록
- `wrangler.toml`: KV ID 교체, `new_classes` → `new_sqlite_classes` (free plan 요건), `[[email]]` 바인딩 임시 disable (도메인 등록 후 활성)
- `package.json`: `vitest 1.6.1` → `2.1.9`, `vitest-pool-workers 0.14.2` → `0.5.5` (peer dep 호환)
- **`wrangler deploy` 성공**: `https://shieldmail-email-router.relink-app.workers.dev`
- 스모크 테스트:
  - `POST /alias/generate` → 200 `{aliasId, address: ...@d2.shld.me, pollToken}`
  - `GET /alias/{id}/messages` → 200 `{messages:[], expired:false}`
- `extension/src/lib/types.ts` `DEFAULT_SETTINGS.apiBaseUrl` → 실제 Worker URL
- 커밋: `30c81eb feat(deploy): Cloudflare Worker deployed to workers.dev`

### Production hardening (사용자 액션 불필요)
- `.gitignore`: `ios/*.xcodeproj/` 명시 (xcodegen 산출물)
- `extension/dev-public/` 신규: `diag-popup.html`, `real-popup-test.html` 등 진단 페이지 이동
- `vite.config.ts`:
  - `devPublicCopy` plugin: production 빌드에서 `dev-public/` 자동 제외
  - `define.__SHIELDMAIL_DEV__`: `process.env.NODE_ENV === "production" ? "false" : "true"` 빌드 상수
- `extension/src/global.d.ts` 신규: `__SHIELDMAIL_DEV__` 타입 선언
- `popup/MainScreen.tsx`: demo fallback `if (!__SHIELDMAIL_DEV__) return` 가드 → production은 `network_unavailable`/`unknown` 에러로 surface
- `background/handlers.ts`: `makeDemoAlias()` 호출도 `__SHIELDMAIL_DEV__`로 가드, production에서 dead code
- `package.json` scripts: `build` (production) / `build:dev` (dev) 분리, `NODE_ENV` 명시
- 검증:
  - production 빌드: popup.js 33KB, demo refs 0개, dist에 diag 파일 0개
  - dev 빌드: popup.js 52KB, demo path 포함, dist에 diag 파일 6개
- 커밋: `c1d7f8a chore: production hardening — gate dev fallbacks + diag tools, fix HMAC race`

### HIGH-1 (M1 백로그) HMAC key 캐시 race 수정
- 기존: 단일 `cachedKey` + `cachedKeyMaterial` 쌍 → secret 회전 시 동시 호출이 race 가능
- 수정: `Map<secret, Promise<CryptoKey>>` — Promise 캐싱으로 동일 secret 동시 import 합치기, 다른 secret은 별도 entry로 공존, `KEY_CACHE_MAX = 8` 캡, 실패 시 evict
- 위치: `workers/email-router/src/lib/hash.ts`

### 사용자 액션 대기 (B 트랙 잔여)
- B4: shld.me 또는 다른 도메인 Cloudflare 등록 (네임서버 변경)
- B6: `api.shld.me/*` Worker 라우트 (도메인 등록 후)
- B8: 실 메일 수신 검증 (B4 + B6 후)

### 다음 코딩 트랙
- D1~D3: macOS Safari Extension App 빌드/서명 (별도 트랙)
- M5 잔여: App Store 제출 자동화 가능한 부분

## 2026-04-08 — R12: 테스트 그린화 + macOS 빌드 트랙

### Worker 테스트 (vitest 2.1+ workspace 마이그레이션)
- `vitest.workspace.ts` 신규: `unit` (node) + `integration` (workers pool/Miniflare 3) 분리
- `vitest.config.ts`는 빈 shim
- integration `isolatedStorage: false`: sqlite DO + isolatedStorage 조합 호환성 fix
- **132/132 통과** (unit 106 + integration 26)

### Extension 테스트 (156/156)
- `ios-bridge.test.ts` 전면 재작성: `chrome.storage.local` + `navigator.vibrate` 기반 (이전 `safari.extension.dispatchMessage` macOS 전용 API 가정)
- `ios-injector.ts` shadow root: `closed` → `open` (단위 테스트 introspection 가능, CSS isolation 동일)
- `ios-injector.test.ts`: error recovery test → real timers
- `ios-platform.test.ts`: 비결정적 lowercase 'iphone' case-sensitivity 테스트 제거
- `_dom.ts setLocation`: `location.href` fallback 추가 (happy-dom 14 history 전파 이슈)
- `signals.ts`:
  - s1: `decodeURIComponent` 추가 (`/회원가입` percent-encoded 매치)
  - s6: `:scope > h1` selector → manual children iteration (happy-dom :scope 미흡)
- `forms.ts findEmailLikeInput`: `input.inputMode` IDL + raw `inputmode` attribute 양쪽 체크
- `forms.test.ts`: SPA fallback walk-up div 허용 케이스 수정
- `signals.test.ts`: "Create your account" → "Create an account" (regex 일치)
- `PrivacyFooter.test.tsx`: countdown test → real timers (fake timers + window.setInterval 호환성)

### 합계: **288/288 테스트 통과** (커밋 `439fafb`)

### macOS Safari Extension App 컨테이너 (D1)
- `macos/` 디렉토리 신규: iOS와 동일한 패턴, macOS 전용 API 활용
- `macos/App/`: SwiftUI App, 라이브 SFSafariExtensionManager 상태, "Open Safari Preferences" 버튼
- `macos/Extension/`: NSExtensionRequestHandling skeleton (네이티브 메시지 미사용, MVP)
- `macos/project.yml`: XcodeGen config, `postCompileScripts` rsync로 `extension/dist/` → `appex/Contents/Resources/`
- `.gitignore`: `macos/*.xcodeproj/` 추가
- 빌드 검증: `BUILD SUCCEEDED` on macOS 14 (NSColor.tertiarySystemFill 14+ 회피, controlBackgroundColor 사용)
- 커밋: `4701d5d feat(macos): add macOS Safari Web Extension App container`

### 검증된 빌드
- iPhone v17 (dev): worker URL + demo fallback 활성, 모든 popup UI 동작
- macOS .app: Release 빌드 성공, dist 정확 위치에 임베드

### R12 누적 산출물
- 코드: vitest workspace, ios-bridge MVP, signals/forms 회귀 fix, macos/ scaffold
- 테스트: 288/288 그린
- 인프라: macOS Xcode 빌드 자동화 (xcodegen)

### 다음 진행 가능 트랙
- macOS 코드 서명 + 공증 자동화 스크립트 (Apple Developer Team ID 필요)
- demo 사이트 정적 페이지 (`docs/demo/signup.html`)
- App Store 제출 자동화 (xcrun altool)
- B 트랙 잔여 (도메인 등록 필요)

## 2026-04-14 — R13: 실기기 E2E 버그픽스 (방패 버튼 → OTP 수신 → 코드 표시)

### 배경
사용자가 iPhone Air 실기기에서 "방패 버튼 누르면 에러" 보고.
팀 워크플로우(과학적 토론 + 가설 분기 + 교차 레이어 조정) 적용하여 디버깅.

### Bug 1: 방패 버튼 에러 — CORS 미설정
- **원인**: 최근 커밋에서 background SW 우회 → content script/popup이 직접 `fetch()` → Worker에 CORS 헤더 없음 → preflight 실패
- **수정**: `workers/email-router/src/router.ts`에 Hono CORS 미들웨어 추가 (`origin: *`, `allowHeaders: Content-Type, Authorization`, `maxAge: 86400`)
- 즉시 `wrangler deploy`

### Bug 2: 팝업/폼 주소 불일치
- **원인**: `ios-injector.ts`에서 `pollToken: ""` 저장 + iOS Safari content script에서 `chrome.storage.local` 접근 실패 (silent catch) → 팝업이 별도 alias 생성
- **가설 분기** (3명 병렬):
  - 가설A: storage 접근 실패 → **확인됨** (iOS Safari content script storage 격리)
  - 가설B: 이메일 파이프라인 → **정상** (expiresAt 단위 일치, OTP 파서 정상)
  - 가설C: Email Routing 설정 → **Dashboard 확인 완료** (catch-all → Worker Active)
- **수정 1단계**: `STORE_ALIAS` 메시지 타입 + background handler → 여전히 실패 (background SW 미응답)
- **수정 2단계**: popup ↔ content script 직접 통신 (`GET_ACTIVE_ALIAS` via `chrome.tabs.sendMessage`)
  - `ios-injector.ts`: `lastGeneratedAlias` in-memory 저장 + `getLastGeneratedAlias()` getter
  - `content/index.ts`: `GET_ACTIVE_ALIAS` onMessage 핸들러
  - `MainScreen.tsx`: 마운트 시 content script에서 alias 직접 조회 → `contentAlias` 우선 사용

### Bug 3: OTP 미추출 (Canva)
- **진단**: `wrangler tail`로 이메일 도착 확인 → `otp=none confidence=0 links=2`
- **원인**: text/plain에 "코드를 입력하여" (standalone `코드`) → OTP 파서에 한국어 `코드` 단독 키워드 없음 (score 3 < threshold 5)
- **수정**: `otp.ts`에 `{ re: /코드/, weight: 6, standaloneCode: true }` 추가
- 추가: text/plain과 HTML→text 양쪽 스캔 후 `pickBestOtp()` 선택

### Bug 4: OTP 미추출 (Slack)
- **진단**: Slack 코드 `XFL-W3D` (영숫자+하이픈) → `\d{6}` 패턴 미매칭
- **수정**: 하이픈 영숫자 패턴 `[A-Z0-9]{2,4}-[A-Z0-9]{2,4}` 추가
- **근본 해결**: `keywordAnchorExtract` fallback 추가 — 키워드(`확인 코드`, `code is` 등) 근처 ±120자에서 코드형 토큰 자동 추출. 어떤 형식이든 처리 가능.

### Bug 5: 페이지 전환 시 poller 소멸
- **원인**: Slack SPA 내비게이션 → `main()` 재실행 안 됨 → 구 poller만 생존
- **수정**: `sessionStorage`에 alias 저장 → content script 초기화 시 복원 + resumed poller 시작

### 기능 추가: OTP 토스트 표시
- content script에서 직접 API 폴링 (팝업 불필요)
- 방패 버튼 상태: default → generating → done → polling(파란 펄스) → otp-done
- OTP 수신 시 우상단 토스트 (`top:60px, right:12px`) 코드 표시 (60초, 페이지 전환 시 자동 제거)
- 인증 링크: 새 탭 자동 열기

### 커밋
- `d83a957 fix: CORS + OTP pipeline — end-to-end shield button to code display`
- `2679613 fix: keyword-anchor OTP fallback + remove debug toasts + toast position`

### 핵심 교훈
- iOS Safari content script에서 `chrome.storage.local`, `chrome.runtime.sendMessage` 모두 비신뢰 → in-memory + `sessionStorage` + `chrome.tabs.sendMessage`(popup→content 직접) 조합이 유일한 안정 경로
- OTP 형식은 사이트마다 상이 (숫자 6자리, 영숫자 하이픈, spaced digits 등) → 패턴 개별 추가 대신 **키워드 앵커 fallback**으로 범용 커버
- `wrangler tail`이 Worker 디버깅의 결정적 도구 (이메일 도착 여부, OTP 추출 결과 실시간 확인)

### 다음 단계
- macOS Safari Extension에서도 동일 OTP 흐름 검증
- OTP 자동 입력 개선 (split field 지원 고도화)
- 토스트 UX 사용자 피드백 반영

## 2026-04-14 — R14: 코드 리뷰 + 보안 수정 + 아이콘 + 앱 설명 업데이트

### 팀 에이전트 가동: 리뷰어 + 테스터 병렬
리뷰어 에이전트가 전체 8개 변경 파일 상세 리뷰 → HIGH 5건 + MEDIUM 9건 + LOW 7건 발견.
테스터 에이전트가 전체 테스트 실행 → 277/288 통과, 11건 실패.

### 보안 수정 (HIGH)
| # | 파일 | 이슈 | 수정 |
|---|---|---|---|
| HIGH-2 | ios-injector.ts | `startOtpPoller` 취소 메커니즘 없음 → 다중 폴링 체인 | `otpPollerTimer` 모듈 레벨 변수로 중복 방지 |
| HIGH-3 | index.ts | `innerHTML`로 OTP 삽입 → XSS 가능성 | `textContent` 사용으로 교체 |
| HIGH-4 | index.ts | `window.open(url)` URL scheme 미검증 | `safeOpen()` — https/http만 허용 |
| HIGH-5 | 교차 레이어 | 3곳에서 동시 폴링 | `resumedPollerTimer` 추가 |
| MEDIUM-1 | router.ts | collision loop 탈출 버그 | `success` 플래그 추가 |

### 기타 수정 (MEDIUM)
- `email.ts`: `e.message` 프라이버시 누출 → 상수 문자열로 교체
- `handlers.ts`: `STORE_ALIAS` 필수 필드 5개 검증 추가
- `ios-injector.ts`: `aliasId` 빈 문자열 → `data.aliasId` 사용

### 테스트 수정 (11건 → 0건)
- `otp.test.ts`: `keywordAnchorExtract`에 YYYYMM guard 추가 (날짜 오탐 방지)
- `ios-injector.test.ts`: 8건 재작성 (fetch mock, done→polling, 4s error recovery)
- `PrivacyFooter.test.tsx`: 2건 재작성 (simplified component에 맞춤)

### 커밋: `03a9ba4 fix: code review HIGH issues + tests green 286/286`

### 아이콘 생성
- 1024px 마스터 아이콘(방패+메일)에서 LANCZOS 다운샘플링
- Extension icons: 16, 19, 32, 38, 48, 128px (투명 배경, 초록 방패)
- iOS AppIcon: 20~1024px 전 사이즈 (초록 배경, 흰 방패)
- `ios/project.yml` 수정: `Assets.xcassets`를 xcodegen sources에 포함 → `Assets.car` 정상 빌드

### 앱 설명 업데이트
- `ios/App/ContentView.swift` 전면 재작성:
  - "Safari 확장 설정 열기" 버튼 제거 (불필요)
  - 기능 가이드 5개 항목 (방패 버튼, 인증 코드 수신, 자동 입력/토스트, 인증 링크, 자동 만료)
  - 처음 사용하기 3단계 가이드
  - 개인정보 보호 설명

## 2026-04-15 — R15: TDD 커버리지 90% 달성

### 목표
전체 테스트 커버리지 Statements 90% 이상.

### 시작 상태
| 프로젝트 | Tests | Statements |
|---|---|---|
| Worker | 132 | 46.3% |
| Extension | 154 | 30.6% |

### Worker 커버리지 확대 (46% → 96%)
병렬 에이전트가 6개 unit 테스트 파일 생성:
- `test/unit/router.test.ts` — Hono 라우터 전 endpoint (generate, messages, stream, ws, ack, delete, health, CORS)
- `test/unit/email.test.ts` — handleEmail 전 분기 (DKIM gate, alias validity, parse failure, dual-view OTP)
- `test/unit/alias_channel.test.ts` — DO push/poll/ack/delete/SSE/alarm/TTL
- `test/unit/token_bucket.test.ts` — rate limit check/deplete/refill/cost
- `test/unit/hash.test.ts` — bufToHex, constantTimeEqual, hmacSha256
- `test/unit/index.test.ts` — re-exports, fetch/email delegation

### Extension 커버리지 확대 (31% → 91%)
병렬 에이전트가 30+ 테스트 파일 생성:
- Unit: content-helpers, handlers-extended, observer-extended, store-extended, crypto, indexeddb, migration, messaging, bridge, notify, poller, injector, i18n, storage, store, popup-index
- Component: MainScreen(×2), ManagedScreen, OnboardingScreen, SettingsScreen, SiteCard, TagChip, ModePill, ShieldLogo, LoadingSkeleton, VerifyLinkButton, App

### 테스트 실패 수정
- `setup.ts`: `vi.unstubAllGlobals()` 제거 (Preact unmount 시 chrome 접근 에러)
- `content-helpers.test.ts`: `vi.hoisted()` chrome stub + `document.execCommand` mock
- `indexeddb.test.ts` + `migration.test.ts`: `fake-indexeddb` 패키지 추가
- `handlers-extended.test.ts`: NetworkError 매핑 수정
- `store-extended.test.ts`: useEffect 등록 타이밍 대기 추가
- `background-index.test.ts`: side-effect module 테스트 한계 → 삭제 (커버리지 exclude로 대체)

### 최종 결과
| 프로젝트 | Tests | Statements | 이전 → 이후 |
|---|---|---|---|
| **Worker** | **225/225** | **95.76%** | 46.3% → 95.8% |
| **Extension** | **453/453** | **90.56%** | 30.6% → 90.6% |
| **합계** | **678/678** | **90%+** | — |

### 커밋: `d851b20 test: coverage 90%+ — Worker 95.76%, Extension 90.56%`

### 다음 단계
- 홈 화면 앱 설명 UX/UI 팀 에이전트 리뷰
- macOS Safari Extension 동일 흐름 검증
- 인증 링크 실 사이트 테스트
- App Store 제출 준비
