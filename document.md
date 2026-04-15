# ShieldMail 기능 문서

---

## 1. 제품 개요

### ShieldMail이란?

ShieldMail은 웹사이트 가입 과정에서 발생하는 프라이버시 노출과 스팸 문제를 자동화 인프라로 해결하는 제품이다. Safari Web Extension 형태로 동작하며, 가입 폼을 자동 감지하고 임시 이메일 주소를 생성하여 입력 필드에 채워 넣는다. 수신된 OTP 코드는 자동으로 추출되어 토스트 알림으로 표시되고, 인증 링크는 자동으로 열린다. 이메일 본문은 서버에 저장되지 않으며, OTP와 인증 링크만 최대 10분간 메모리에 임시 보관 후 자동 삭제된다.

### 타겟 사용자

- **1차 타겟**: 개발자/QA 엔지니어 -- 빠른 반복 테스트 시 매번 새 이메일이 필요한 사용자
- **2차 타겟**: 일상 가입 보호 -- 스팸 차단과 프라이버시 보호를 원하는 일반 사용자

### 핵심 가치

1. **자동화**: 가입 폼 감지 -> 임시 이메일 생성 -> OTP 수신 -> 인증 완료까지 원클릭
2. **프라이버시**: 이메일 본문 비저장, OTP/링크만 추출, DKIM 검증, 페이로드 화이트리스트 적용
3. **경량성**: Cloudflare Edge 기반으로 별도 서버 운영 없이 글로벌 배포

---

## 2. 아키텍처 개요

### 3개 레이어

| 레이어 | 설명 | 기술 스택 |
|--------|------|-----------|
| **iOS/macOS App** | StoreKit 2 구독 관리, App Groups로 Extension과 상태 공유 | Swift, StoreKit 2, UIKit/SwiftUI |
| **Safari Web Extension** | 가입 폼 감지, 방패 버튼 주입, OTP 토스트, 팝업 UI | TypeScript, Preact, Vite, Manifest V3 |
| **Cloudflare Worker** | 이메일 수신/파싱, API 라우팅, alias 관리, 구독 검증 | TypeScript, Hono, PostalMime, Durable Objects, KV |

### 데이터 흐름도

```
[사용자 브라우저]
    |
    |  1. SignupObserver가 가입 폼 감지 (12 signals 평가)
    |  2. 방패 아이콘/플로팅 버튼 주입
    |  3. 사용자 클릭
    |
    v
[Content Script] --fetch()--> [Cloudflare Worker: POST /alias/generate]
    |                              |
    |                              |-- DailyQuota DO (구독 tier별 일일 한도 확인)
    |                              |-- TokenBucket DO (IP 기반 Rate Limit)
    |                              |-- ALIAS_KV에 alias 레코드 저장
    |                              |-- JWT pollToken 서명 및 반환
    |                              |
    |  4. 임시 이메일 주소 입력 필드에 자동 채움
    |  5. OTP 폴링 시작 (3초 간격, 최대 5분)
    |
    v
[외부 서비스] --이메일 발송--> [Cloudflare Email Routing]
                                    |
                                    v
                             [Worker: email() handler]
                                    |
                                    |-- DKIM 검증 (fail 시 무시)
                                    |-- ALIAS_KV에서 alias 유효성 확인
                                    |-- PostalMime으로 파싱
                                    |-- OTP 추출 (keyword scoring)
                                    |-- 인증 링크 추출 (tracking param 제거)
                                    |-- sanitizeDoPayload() 화이트리스트 적용
                                    |-- AliasChannel DO에 push
                                    |
                                    v
                             [AliasChannel DO]
                                    |
                                    |-- 메시지 저장 (TTL 10분, alarm 기반 자동 삭제)
                                    |-- SSE 브로드캐스트 (연결된 클라이언트에)
                                    |
    [Content Script / Popup] <-- GET /alias/:id/messages (polling)
    |
    |  6. OTP 토스트 표시 + 자동 입력
    |  7. 또는 인증 링크 자동 열기
    v
[가입 완료]
```

---

## 3. 핵심 기능

### 3.1 임시 이메일 생성 (방패 버튼)

#### 기능 설명
가입 폼의 이메일 입력 필드 옆에 방패 아이콘(macOS) 또는 플로팅 버튼(iOS)을 표시한다. 클릭하면 Worker API에 직접 요청하여 임시 이메일 주소를 생성하고 입력 필드에 자동으로 채운다.

#### 사용자 흐름
1. 가입 페이지 방문 -> SignupObserver가 12개 시그널 평가 -> 임계값(0.7) 초과 시 활성화
2. 방패 아이콘 표시 (macOS: 입력 필드 우측 인라인 / iOS: 화면 우하단 고정 56px 버튼)
3. 사용자 클릭 -> "generating" 상태 (스피너 애니메이션)
4. Worker API `POST /alias/generate` 호출
5. 응답 수신 -> 이메일 주소를 입력 필드에 채움 (React/Vue/Svelte 호환 이벤트 디스패치)
6. "done" 상태 (체크마크) -> OTP 폴링 시작

#### 관련 소스 파일
- `extension/src/content/injector.ts` -- macOS용 ShieldIconInjector (Shadow DOM, 인라인 아이콘)
- `extension/src/content/ios-injector.ts` -- iOS용 IOSFloatingButtonInjector (고정 위치, 키보드 추적)
- `extension/src/content/index.ts` -- Content script 엔트리 (iOS/macOS 분기, OTP 자동 입력)
- `extension/src/content/bridge.ts` -- chrome.runtime.sendMessage 래퍼 (타임아웃, 안전한 에러 처리)
- `workers/email-router/src/router.ts` -- `POST /alias/generate` 엔드포인트

#### 기술 구현 세부사항
- **Alias ID**: `crypto.randomUUID()`에서 14자 hex 슬라이스 (56비트, 충돌 확률 < 0.001% at 1M aliases)
- **충돌 방지**: KV에서 기존 키 확인, 최대 3회 재시도
- **필드 채움**: `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set`으로 React/Vue의 합성 이벤트 시스템과 호환
- **키보드 단축키**: `Cmd+Shift+E` (macOS) / `Ctrl+Shift+E` (Windows) -- manifest.json `commands`로 등록, background -> content `FORCE_INJECT` 메시지
- **iOS 키보드 추적**: `window.visualViewport` resize/scroll 이벤트로 키보드 높이 동적 조정
- **haptic feedback**: iOS에서 Web Vibration API (`navigator.vibrate()`)로 햅틱 피드백 제공

---

### 3.2 OTP 자동 수신 + 토스트 표시

#### 기능 설명
임시 이메일로 수신된 인증 메일에서 OTP 코드를 자동 추출하여 화면에 토스트로 표시하고, 가능한 경우 OTP 입력 필드에 자동으로 채운다.

#### 사용자 흐름
1. 임시 이메일 생성 후 OTP 폴링 자동 시작 (3초 간격, 최대 5분)
2. 이메일 수신 시 Worker가 OTP 추출 -> AliasChannel DO에 push
3. Content script 또는 popup이 `GET /alias/:id/messages` 폴링으로 OTP 수신
4. OTP 토스트 표시 (화면 우상단, 60초 후 자동 dismiss)
5. OTP 입력 필드 자동 감지 및 채움 (지원 형식: single field, split 4-8자리)
6. SPA 내비게이션 시 토스트 자동 dismiss

#### 관련 소스 파일
- `workers/email-router/src/parser/otp.ts` -- OTP 추출 엔진 (multi-pattern, keyword scoring)
- `workers/email-router/src/email.ts` -- Email Worker handler (파싱, 추출, DO push)
- `extension/src/content/index.ts` -- `showOtpToast()`, `fillOtp()`, `findOtpTarget()`
- `extension/src/content/ios-injector.ts` -- `startOtpPoller()` (Content script 직접 API 폴링)
- `extension/src/popup/screens/MainScreen.tsx` -- Popup OTP 표시 및 폴링

#### 기술 구현 세부사항

**OTP 추출 알고리즘** (`parser/otp.ts`):
- **패턴 매칭**: 7개 정규식 패턴 -- 6자리(`\d{6}`), 3-3 분할(`\d{3}[-\s]\d{3}`), 스페이스 분할(`\d \d \d \d \d \d`), 8자리, 영숫자 6-8자, 하이픈 영숫자(`XFL-W3D`), 4자리
- **키워드 스코어링**: +/-60자 컨텍스트 윈도우에서 긍정/부정 키워드 가중치 합산
  - 긍정 키워드 (EN/KO/CN/JP): `verification code`(+10), `OTP`(+10), `인증번호`(+10), `验证码`(+10) 등
  - 부정 키워드: `order`(-8), `price`(-8), `주문`(-8), `$\d`(-8) 등
- **날짜 필터**: `YYYY` 형식(19xx/20xx), `YYYYMMDD` 형식, `YYYYMM` 형식 자동 제외
- **확정 임계값**: score >= 5
- **신뢰도 계산**: `clamp(score / 20, 0, 1)`
- **키워드 앵커 폴백**: 메인 추출 실패 시 인증 키워드 근처 +-120자에서 코드 토큰 추출 (confidence 0.7)
- **양방향 스캔**: text/plain과 HTML->text 양쪽 모두 스캔, 더 높은 confidence 선택

**OTP 입력 필드 감지** (`content/index.ts: findOtpTarget()`):
1. `autocomplete="one-time-code"` 속성 우선
2. split field 감지: maxLength=1인 인접 input 4-8개 그룹
3. `inputmode="numeric"` + maxLength 4-8
4. name/id/placeholder에서 otp/code/verify/인증/확인 키워드 매칭

---

### 3.3 인증 링크 자동 열기

#### 기능 설명
수신 이메일에서 인증/확인 링크를 추출하여, OTP가 없는 경우 자동으로 새 탭에서 연다.

#### 사용자 흐름
1. 이메일 수신 -> 인증 링크 추출
2. OTP가 없고 인증 링크만 있는 경우 -> `window.open(url, "_blank", "noopener")`로 자동 열기
3. OTP와 인증 링크 모두 있는 경우 -> popup에서 "인증 링크 열기" 버튼 표시

#### 관련 소스 파일
- `workers/email-router/src/parser/links.ts` -- 인증 링크 추출 및 정제
- `extension/src/content/index.ts` -- `safeOpen()`, `setVerifyLinkCallback()`
- `extension/src/popup/components/VerifyLinkButton.tsx` -- Popup 내 인증 링크 버튼

#### 기술 구현 세부사항
- **추출 우선순위**: HTML `<a href>` 우선, plaintext URL 폴백
- **프로토콜 제한**: `https:` 전용 (`javascript:`, `data:`, `http:` 거부)
- **트래킹 파라미터 제거**: `utm_*`, `fbclid`, `gclid`, `mc_*`, `_hs*`, `__hs*`
- **키워드 랭킹**: verify/confirm/activate/validate/인증/확인/auth/magic 키워드로 순위 산정
- **결과 제한**: 상위 3개 고유 URL만 반환
- **안전한 열기**: `safeOpen()` 함수가 URL 프로토콜을 재검증 후 `noopener`로 열기

---

### 3.4 폼 감지 (SignupObserver + 12 Signals)

#### 기능 설명
MutationObserver로 DOM 변화를 감시하며, 새 폼이 추가될 때 12개 시그널을 평가하여 가입 폼인지 판별한다. 멀티 게이트 스코어러로 최종 활성화 여부를 결정한다.

#### 사용자 흐름
1. 페이지 로드 / DOM 변경 감지 (250ms 디바운스)
2. `discoverForms()`: `<form>` 태그 + form-less SPA 페이지의 loose 이메일 필드 탐색
3. 12개 시그널 평가 -> 3단계 게이트 검증 -> 임계값(0.7) 이상 시 활성화

#### 관련 소스 파일
- `extension/src/content/observer.ts` -- SignupObserver (MutationObserver, 디바운스, 재평가 제한)
- `extension/src/content/detect/signals.ts` -- 12개 시그널 구현 (S1-S12)
- `extension/src/content/detect/scorer.ts` -- 멀티 게이트 스코어러
- `extension/src/content/detect/forms.ts` -- 폼 발견 및 이메일 필드 탐지 (Gate A)
- `extension/src/content/detect/keywords.ts` -- 다국어 키워드 사전 (KO/EN)

#### 기술 구현 세부사항

**12개 시그널 (S1-S12)**:

| ID | 카테고리 | 가중치 | 설명 |
|----|----------|--------|------|
| S1 | URL | +0.35 | URL 경로에 signup/register/가입 키워드 |
| S2 | TEXT | +0.15 | `<title>`에 가입 키워드 |
| S3 | TEXT | +0.25 | 제출 버튼 텍스트에 가입 키워드 |
| S4 | STRUCT | +0.30 | 비밀번호 확인 필드 존재 (2개 password input) |
| S5 | STRUCT | +0.20 | 약관 동의 체크박스 존재 |
| S6 | TEXT | +0.15 | 폼 내/근처 헤딩에 가입 키워드 |
| S7 | URL | +0.15 | form action URL에 가입 키워드 |
| S8 | TEXT | +0.10 | ToS/Privacy 링크 존재 |
| S9 | STRUCT | +0.10 | CAPTCHA iframe 또는 OTP/verification 필드 |
| S10 | STRUCT | +0.10 | 소셜 로그인 버튼 3개 이상 |
| S11 | TEXT | -0.40 | **Hard Reject**: 로그인/비밀번호찾기 전용 페이지 |
| S12 | TEXT | -0.50 | **감쇠**: 뉴스레터 (input 2개 이하 + newsletter 키워드) |

**3단계 게이트**:
- **Gate A**: 이메일 유사 input 필드 필수 (type=email / inputmode=email / autocomplete=email / name/id 힌트)
- **Gate B**: S11 hard reject 시 즉시 score=0, 비활성화
- **Gate C**: 양의 시그널이 2개 이상 다른 카테고리(URL/TEXT/STRUCT)에서 와야 함. 미달 시 score *= 0.5

**멀티 스텝 가입 부스트**: sessionStorage에 10분 TTL intent 기록. 같은 origin에서 재방문 시 +0.15 부스트.

**디바운스 및 재평가 제한**: 250ms 디바운스, 폼당 최대 3회 재평가.

---

### 3.5 구독 모델

#### 기능 설명

| 플랜 | 일일 한도 | 가격 |
|------|-----------|------|
| Free | 1회/일 | 무료 |
| Pro | 20회/일 | $0.99/월 |

#### 사용자 흐름
1. 무료 한도 초과 시 LimitSheet 바텀 시트 표시 ("오늘의 무료 한도를 모두 사용했어요")
2. "Pro 업그레이드" 버튼 -> iOS StoreKit 2 결제 또는 `shieldmail://subscribe` URL scheme
3. 구독 상태는 App Groups UserDefaults -> SafariExtensionHandler -> Extension에서 읽기
4. JWS 서명을 Worker에 전송하여 서버 측 검증

#### 관련 소스 파일
- `ios/App/SubscriptionManager.swift` -- StoreKit 2 구독 관리 (구매/복원/갱신 감시)
- `ios/Extension/SafariExtensionHandler.swift` -- Native messaging으로 구독 상태 전달
- `extension/src/lib/subscription.ts` -- 구독 상태 조회 (캐시 1시간 TTL, native messaging, 폴백)
- `extension/src/popup/screens/SubscriptionScreen.tsx` -- 구독 화면 UI
- `extension/src/popup/components/LimitSheet.tsx` -- 한도 초과 바텀 시트
- `extension/src/popup/components/UsageBadge.tsx` -- 사용량 배지 (0/1 사용)
- `workers/email-router/src/do/DailyQuota.ts` -- 서버 측 일일 할당량 DO
- `workers/email-router/src/lib/apple-jws.ts` -- Apple JWS 서명 검증

#### 기술 구현 세부사항
- **StoreKit 2**: `Product.products(for:)`, `product.purchase()`, `Transaction.currentEntitlements`, `Transaction.updates` (실시간 갱신/취소 감지)
- **Product ID**: `me.shld.shieldmail.pro.monthly`
- **App Groups**: `group.me.shld.shieldmail` -- `sm_tier`, `sm_jws`, `sm_expires`, `sm_product_id` 키
- **JWS 검증**: Apple Root CA G3 핑거프린트 고정, x5c 체인 검증, ECDSA P-256 서명 검증, expiresDate/environment 확인
- **DailyQuota DO**: `quota:{identifier}:{YYYY-MM-DD}` ID로 DO 인스턴스 생성 -> 날짜 변경 = 새 인스턴스 = 자동 리셋
- **Tier 결정 우선순위**: (1) adminSecret + adminTier (2) JWS 서명 검증 -> productId 매칭 (3) 기본값 "free"
- **Free tier 식별자**: 항상 클라이언트 IP 사용 (deviceId 스푸핑 방지)
- **Pro tier 식별자**: deviceId 사용 (JWS로 검증된 경우, 네트워크 이동 시 일관성)

---

### 3.6 관리자 테스트 모드

#### 기능 설명
설정 화면에서 버전 번호를 5회 탭하면 관리자 코드 입력 필드가 나타난다. 올바른 코드 입력 시 관리자 패널이 활성화되어 Free/Pro tier 전환 및 사용 통계 조회가 가능하다.

#### 사용자 흐름
1. 설정 화면 -> 버전 번호 5회 빠르게 탭 (2초 이내)
2. 관리자 코드 입력 -> `POST /admin/auth` 검증
3. 관리자 패널 활성화: Free/Pro 토글, 사용 통계 (이번주 무료/누적 무료/이번달 구독)
4. Tier 전환 시 `POST /admin/set-tier` 호출 -> content script에 `SET_ADMIN` 메시지 전달

#### 관련 소스 파일
- `extension/src/popup/screens/SettingsScreen.tsx` -- 관리자 패널 UI
- `workers/email-router/src/router.ts` -- `POST /admin/auth`, `POST /admin/set-tier`, `POST /admin/stats`
- `extension/src/content/index.ts` -- `SET_ADMIN` 메시지 수신 (sessionStorage에 tier 저장)
- `extension/src/content/ios-injector.ts` -- adminSecret/adminTier를 alias generate 요청에 포함

#### 기술 구현 세부사항
- **인증**: ADMIN_SECRET (wrangler secret) 비교 -- 서버 측에서만 검증
- **Tier 오버라이드**: KV에 `admin-tier:{identifier}` 키로 저장 (24시간 TTL)
- **IP + deviceId 이중 저장**: content script 요청은 deviceId가 없으므로 IP 기반으로도 tier 저장
- **통계**: KV에 `stats:{tier}:week:{YYYY-Wnn}`, `stats:{tier}:month:{YYYY-MM}`, `stats:{tier}:total` 키로 카운터 저장

---

## 4. API 엔드포인트

Worker 도메인: `https://api.shldmail.work`

### POST /alias/generate

임시 이메일 alias를 생성한다.

**요청 Body** (JSON):
```json
{
  "mode": "ephemeral" | "managed",   // (optional, default: "ephemeral")
  "ttlSec": 3600,                     // (optional, 60-86400, default: 3600)
  "label": "GitHub Signup",           // (optional, 1-64자)
  "deviceId": "uuid-string",          // (optional, Pro tier 식별용)
  "subscriptionJWS": "eyJ...",        // (optional, Apple StoreKit 2 JWS)
  "adminSecret": "...",               // (optional, 관리자 오버라이드)
  "adminTier": "pro" | "free"         // (optional, adminSecret과 함께 사용)
}
```

**성공 응답** (200):
```json
{
  "aliasId": "a1b2c3d4e5f6g7",
  "address": "a1b2c3d4e5f6g7@shldmail.work",
  "expiresAt": 1713200000,            // Unix timestamp (seconds), null for managed
  "pollToken": "eyJhbGciOiJIUzI...",
  "remaining": 0,                     // 남은 일일 한도
  "limit": 1,                         // 일일 한도
  "tier": "free"                      // 적용된 tier
}
```

**에러 응답**:
| 상태 코드 | error | 설명 |
|-----------|-------|------|
| 400 | `cost_exceeds_capacity` | Rate limit cost가 capacity 초과 |
| 403 | `daily_limit_exceeded` | 일일 한도 초과 (remaining=0, limit, resetAt 포함) |
| 429 | `rate_limited` | IP 기반 Rate limit (retryAfterMs 포함) |
| 503 | `alias_generation_failed` | 3회 충돌 재시도 실패 |

---

### GET /alias/:id/messages?since=\<ms\>

alias에 수신된 메시지를 조회한다.

**헤더**: `Authorization: Bearer <pollToken>`

**쿼리 파라미터**:
- `since` (optional): ms epoch timestamp, 이후 메시지만 반환

**성공 응답** (200):
```json
{
  "messages": [
    {
      "id": "uuid-string",
      "otp": "123456",                // (optional)
      "confidence": 0.85,             // (optional, 0-1)
      "verifyLinks": ["https://..."], // (optional, 최대 3개)
      "receivedAt": 1713199000000     // ms epoch
    }
  ],
  "expired": false
}
```

---

### GET /alias/:id/stream

Server-Sent Events (SSE) 스트림으로 실시간 메시지 수신.

**헤더**: `Authorization: Bearer <pollToken>`

**SSE 이벤트 형식**:
```
id: <message-id>
event: message
data: {"id":"...","otp":"123456","confidence":0.85,"receivedAt":1713199000000}
```

**구현 특징**:
- `Last-Event-ID` 헤더 지원 (재연결 시 중복 방지)
- 30초 heartbeat (`: ping\n\n`)으로 Cloudflare 유휴 타임아웃 방지
- Reconnect-race fix: 클라이언트 등록 후 스토리지 조회로 메시지 누락 방지

---

### GET /alias/:id/ws

WebSocket hibernation 엔드포인트 (M4 예정, 현재 stub).

**헤더**: `Authorization: Bearer <pollToken>`

**현재 상태**: `500 "WS hibernation -- M4"` 에러 반환

---

### POST /alias/:id/ack

alias의 모든 메시지를 확인(삭제)한다.

**헤더**: `Authorization: Bearer <pollToken>`

**성공 응답** (200):
```json
{ "ok": true }
```

---

### DELETE /alias/:id

alias를 영구 삭제한다 (KV 레코드 + DO 스토리지 + SSE 클라이언트 정리).

**헤더**: `Authorization: Bearer <pollToken>`

**성공 응답** (200):
```json
{ "ok": true }
```

---

### POST /admin/auth

관리자 인증을 검증한다.

**요청 Body**:
```json
{ "secret": "admin-secret-string" }
```

**응답** (200):
```json
{ "admin": true }
```

---

### POST /admin/set-tier

관리자가 특정 identifier의 tier를 오버라이드한다 (24시간 TTL).

**요청 Body**:
```json
{
  "secret": "admin-secret-string",
  "identifier": "device-or-ip",     // (optional, 미제공 시 클라이언트 IP)
  "tier": "pro" | "free"
}
```

**에러**: 403 `not_admin`

---

### POST /admin/stats

사용 통계를 조회한다.

**요청 Body**:
```json
{ "secret": "admin-secret-string" }
```

**응답** (200):
```json
{
  "freeThisWeek": 42,
  "freeTotal": 1234,
  "proThisMonth": 89,
  "period": { "week": "2026-W15", "month": "2026-04" }
}
```

---

### GET /health

헬스체크 엔드포인트.

**응답** (200):
```json
{ "ok": true, "service": "shieldmail-email-router" }
```

---

### 공통 에러 코드

| 상태 코드 | error | 설명 |
|-----------|-------|------|
| 401 | `missing_token` | Authorization 헤더 없음 |
| 401 | `bad_token` | JWT 서명 검증 실패 또는 만료 |
| 401 | `alias_mismatch` | 토큰의 aliasId와 요청 aliasId 불일치 |
| 401 | `token_revoked` | 토큰 해시 불일치 (회전된 토큰) |
| 404 | `unknown_alias` | KV에 alias 레코드 없음 |
| 410 | `alias_expired` | ephemeral alias TTL 만료 |

---

## 5. 보안

### 5.1 프라이버시 설계 (메일 내용 비저장)

- **Email Worker**: `msg.raw`는 PostalMime으로 한 번 소비되어 `parsed` 로컬 변수에 바인딩된 후 참조되지 않음. GC 대상.
- **sanitizeDoPayload()**: 화이트리스트 방식 -- `otp`, `confidence`, `verifyLinks`, `receivedAt` 4개 키만 허용
- **금지 키 감시**: `raw`, `html`, `text`, `from`, `subject`, `to`, `headers`, `messageId`, `body` 등이 페이로드에 포함되면 즉시 에러
- **DO 저장**: sanitize된 `DoPushPayload`만 AliasChannel DO에 저장
- **알림**: OS 알림에 OTP 포함 금지 -- alias 주소만 표시 ("인증 코드 도착")
- **팝업 언마운트 시**: 메모리의 OTP 상태 즉시 정리 (`setMessages([])`)
- **입력 변환 크기 제한**: HTML 200KB, Text 50KB로 잘라서 CPU 스파이크 방지

관련 파일: `workers/email-router/src/lib/sanitize.ts`, `workers/email-router/src/email.ts`

### 5.2 JWS 서명 검증

Apple StoreKit 2 JWS를 서버 측에서 검증하여 구독 상태를 확인한다.

**검증 단계**:
1. JWS 구조 검증 (3-part compact serialization)
2. 헤더 알고리즘 확인 (`ES256` ECDSA P-256)
3. x5c 인증서 체인 검증 (최소 3개 인증서)
4. 루트 인증서 SHA-256 핑거프린트가 Apple Root CA G3과 일치하는지 확인
5. 리프 인증서에서 공개키 추출 (ASN.1 DER 파싱 -> SPKI 추출)
6. ECDSA 서명 검증 (`crypto.subtle.verify`)
7. 페이로드의 `expiresDate` 만료 확인
8. `environment`가 "Production" 또는 "Sandbox"인지 확인
9. 실패 시 안전 기본값 (free tier) 반환 -- 크래시 없음

관련 파일: `workers/email-router/src/lib/apple-jws.ts`

### 5.3 DKIM 게이트

수신 이메일의 `authentication-results` 헤더에서 `dkim=fail`이 감지되면 메시지를 무시하고 조용히 드롭한다. 바운스하지 않음으로써 alias 존재 여부가 발신자에게 노출되는 것을 방지한다.

관련 파일: `workers/email-router/src/email.ts` (line 63-67)

### 5.4 Rate Limiting

**TokenBucket Durable Object**:
- 알고리즘: 토큰 버킷 (고정 속도 충전)
- `/alias/generate` 기본 설정: capacity=30, refillPerSec=0.5
- 클라이언트 IP 기반 (`cf-connecting-ip` / `x-forwarded-for`)
- 429 응답에 `retryAfterMs` 포함
- cost > capacity일 때 400 `cost_exceeds_capacity` 반환

**DailyQuota Durable Object**:
- 날짜 기반 DO 인스턴스 (`quota:{id}:{YYYY-MM-DD}`)
- Free: 1회/일, Pro: 20회/일
- 403 응답에 `remaining`, `limit`, `resetAt` (다음 UTC 자정) 포함

관련 파일: `workers/email-router/src/do/TokenBucket.ts`, `workers/email-router/src/do/DailyQuota.ts`

### 5.5 CORS 정책

```typescript
cors({
  origin: "*",
  allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
})
```

`origin: "*"` 사용 이유: Extension content script와 popup은 `chrome-extension://`, `safari-web-extension://` origin에서 요청하며, 인증은 토큰 기반이므로 permissive origin이 안전하다.

관련 파일: `workers/email-router/src/router.ts` (line 37-45)

### 5.6 JWT (Poll Token)

- **알고리즘**: HS256 (HMAC-SHA256)
- **페이로드**: `{ aliasId, exp }` (exp: seconds since epoch)
- **서명 키**: HMAC_KEY (wrangler secret)
- **저장 시 해시**: KV의 `tokenHash`에 SHA-256 해시 저장 (토큰 회전 가드)
- **Constant-time 비교**: 서명 검증과 토큰 해시 비교 모두 constant-time equality 사용
- **키 캐시**: 동시 요청 시 `importKey()` 중복 호출 방지, Map 기반 Promise 캐시 (최대 8 엔트리)

관련 파일: `workers/email-router/src/lib/jwt.ts`, `workers/email-router/src/lib/hash.ts`

---

## 6. iOS 앱

### 6.1 StoreKit 2 구독

**SubscriptionManager** (`ios/App/SubscriptionManager.swift`):
- `@MainActor` ObservableObject로 SwiftUI와 통합
- `loadProducts()`: App Store에서 `me.shld.shieldmail.pro.monthly` 상품 정보 로드
- `purchase()`: 구매 -> `VerificationResult` 검증 -> `handleTransaction()`
- `restore()`: `AppStore.sync()` -> `checkEntitlements()`
- `listenForUpdates()`: `Transaction.updates` 스트림으로 갱신/취소/환불 실시간 감지
- `showManageSubscriptions()`: Apple 구독 관리 시트 표시

### 6.2 App Groups 공유

**App Group**: `group.me.shld.shieldmail`

**UserDefaults 키**:
| 키 | 타입 | 설명 |
|----|------|------|
| `sm_tier` | String | "free" 또는 "pro" |
| `sm_jws` | String? | StoreKit transaction JSON의 base64 인코딩 |
| `sm_expires` | Double | 만료일 epoch seconds |
| `sm_product_id` | String? | 상품 ID |

**흐름**: App에서 구매 -> App Groups UserDefaults 업데이트 -> Extension의 SafariExtensionHandler가 읽기

관련 파일:
- `ios/App/ShieldMail.entitlements` -- App Groups 엔타이틀먼트
- `ios/Extension/ShieldMailExtension.entitlements` -- Extension App Groups 엔타이틀먼트

### 6.3 SafariExtensionHandler

`ios/Extension/SafariExtensionHandler.swift`:
- `NSExtensionRequestHandling` 프로토콜 구현
- `browser.runtime.sendNativeMessage()` 요청 처리
- **지원 액션**:
  - `getSubscription`: App Groups에서 구독 상태 읽어서 반환 (tier, jws, expiresDate, productId)
  - `purchase`: `shieldmail://subscribe` URL scheme 반환 (Extension에서 StoreKit 직접 호출 불가)
- **메시지 키**: `SFExtensionMessageKey` = `"message"` (iOS Safari Web Extension 규약)

---

## 7. 데이터 저장소

### 7.1 Cloudflare KV (ALIAS_KV)

| 키 패턴 | 값 | TTL | 설명 |
|---------|-----|-----|------|
| `alias:{aliasId}` | `AliasRecord` JSON | ephemeral: 60-86400초, managed: 없음 | alias 메타데이터 |
| `admin-tier:{identifier}` | "pro" 또는 "free" | 86400초 (24시간) | 관리자 tier 오버라이드 |
| `stats:{tier}:week:{YYYY-Wnn}` | 숫자 문자열 | 604800초 (7일) | 주간 생성 카운터 |
| `stats:{tier}:month:{YYYY-MM}` | 숫자 문자열 | 2678400초 (31일) | 월간 생성 카운터 |
| `stats:{tier}:total` | 숫자 문자열 | 없음 | 누적 생성 카운터 |
| `user:{tier}:{identifier}` | "1" | 2678400초 | 사용자 존재 마커 |

**AliasRecord 구조**:
```typescript
{
  mode: "ephemeral" | "managed",
  domain: string,
  createdAt: number,      // ms epoch
  expiresAt: number | null, // ms epoch, null for managed
  tokenHash: string,      // SHA-256 hex of pollToken
  label?: string
}
```

관련 파일: `workers/email-router/src/types/env.ts`

### 7.2 Durable Objects

#### AliasChannel (MSG_DO)
- **인스턴스 단위**: alias ID당 1개
- **스토리지 키**: `msg:{receivedAt}-{uuid}` -> `StoredMessage`
- **TTL**: `MESSAGE_TTL_MS` (기본 600000 = 10분), alarm 기반 만료 스위프
- **기능**: push, poll, SSE, ack, delete
- **SSE**: `Set<SseClient>` 관리, Last-Event-ID 지원, 30초 heartbeat

관련 파일: `workers/email-router/src/do/AliasChannel.ts`

#### TokenBucket (RATE_LIMIT)
- **인스턴스 단위**: `gen:{clientIP}`
- **스토리지 키**: `bucket:state` -> `{ tokens, lastRefillMs }`
- **알고리즘**: 토큰 버킷 (capacity=30, refillPerSec=0.5)

관련 파일: `workers/email-router/src/do/TokenBucket.ts`

#### DailyQuota (DAILY_QUOTA)
- **인스턴스 단위**: `quota:{identifier}:{YYYY-MM-DD}`
- **스토리지 키**: `quota:count` -> number
- **한도**: free=1, pro=20

관련 파일: `workers/email-router/src/do/DailyQuota.ts`

### 7.3 chrome.storage.local

| 키 | 타입 | 설명 |
|----|------|------|
| `settings` | `UserSettings` | 사용자 설정 (apiBaseUrl, autoCopyOtp, detectionThreshold 등) |
| `activeAliases` | `Record<origin, AliasRecord>` | 현재 활성 alias (origin별) |
| `managedAliases` | `Record<aliasId, AliasRecord>` | Managed Mode alias 목록 |
| `activePollers` | `Record<aliasId, PollerState>` | 활성 OTP 폴러 상태 |
| `onboardingCompleted` | boolean | 온보딩 완료 여부 |
| `deviceId` | string | 디바이스 고유 ID (crypto.randomUUID) |
| `subscriptionCache` | `SubscriptionCache` | 구독 상태 캐시 (1시간 TTL) |
| `adminMode` | boolean | 관리자 모드 활성화 |
| `adminSecret` | string | 관리자 시크릿 |
| `adminTier` | "free" \| "pro" | 관리자 설정 tier |
| `sm_token_{aliasId}` | string | Poll token (iOS bridge) |
| `sm_recent_aliases` | Array | 최근 alias 목록 (최대 3개) |
| `managedKey` | JsonWebKey | Managed Mode AES-256-GCM 암호화 키 |

관련 파일: `extension/src/background/storage.ts`, `extension/src/content/ios-bridge.ts`

### 7.4 sessionStorage

| 키 | 설명 |
|----|------|
| `__sm_alias__` | 현재 페이지에서 생성한 alias (페이지 내비게이션 시 OTP 폴링 유지) |
| `__sm_usage__` | 사용량 데이터 (remaining, limit, tier) |
| `__sm_admin__` | 관리자 tier (secret 미포함) |
| `shieldmail:recentSignupIntent` | 멀티 스텝 가입 부스트 기록 (origin, ts, 10분 TTL) |

### 7.5 IndexedDB (Managed Mode)

**DB명**: `shieldmail_v1`, 버전 1

| Object Store | keyPath | 인덱스 | 설명 |
|-------------|---------|--------|------|
| `aliasStore` | `aliasId` | -- | 관리 모드 alias 메타데이터 |
| `messageStore` | `id` | `aliasId` | 암호화된 메시지 (AES-256-GCM) |

**암호화**: `crypto.ts`에서 AES-256-GCM 사용. 키는 JWK 형태로 `chrome.storage.local`에 저장. IV 12바이트를 ciphertext 앞에 결합.

관련 파일: `extension/src/lib/indexeddb.ts`, `extension/src/lib/crypto.ts`

---

## 8. 테스트

### 8.1 테스트 스택

| 영역 | 프레임워크 | 환경 | 설명 |
|------|------------|------|------|
| Worker 단위 테스트 | Vitest 2.1 | Node.js | 파서, sanitize, JWT, alias, hash 등 순수 함수 |
| Worker 통합 테스트 | Vitest 2.1 + @cloudflare/vitest-pool-workers | Miniflare 3 | 실제 DO storage, KV, alarm, email handler |
| Extension 단위 테스트 | Vitest 1.6 | happy-dom | background, content, lib 모듈 |
| Extension 컴포넌트 테스트 | Vitest 1.6 | happy-dom | Preact 컴포넌트 렌더링 + 인터랙션 |

### 8.2 커버리지 현황

| 영역 | Statements | 비고 |
|------|------------|------|
| **Worker (email-router)** | **87.47%** (1243/1421) | unit + integration |
| **Extension** | **80.66%** (4415/5473) | unit + component |

### 8.3 테스트 파일 구조

**Worker** (`workers/email-router/test/`):
- `unit/` -- alias, alias_channel, apple-jws, daily_quota, email, hash, html, index, jwt, links, otp, router, sanitize, token_bucket 테스트
- `integration/` -- alias_channel, email_handler, router 통합 테스트
- `fixtures/emails/` -- github_verification.eml, naver_otp.eml, multilang_otp.eml, malformed.eml 등 테스트 이메일

**Extension** (`extension/test/`):
- `unit/` -- api, bridge, content-helpers, crypto, detect (forms, keywords, scorer, signals), handlers, handlers-extended, i18n, indexeddb, injector, messaging, migration, notify, notify-extended, observer, observer-extended, poller, popup-index, storage, store, store-extended 테스트
- `component/` -- App, ErrorCard, LoadingSkeleton, MainScreen, MainScreen-extended, ManagedScreen, ModePill, OnboardingScreen, OtpBox, PrivacyFooter, SettingsScreen, ShieldLogo, SiteCard, TagChip, VerifyLinkButton 테스트
- `ios-bridge.test.ts`, `ios-injector.test.ts`, `ios-platform.test.ts` -- iOS 관련 테스트
- `fixtures/signup-pages/` -- github-signup.html, login-page.html, newsletter-footer.html, spa-signup.html

### 8.4 테스트 실행 방법

```bash
# Worker 테스트 (전체)
cd workers/email-router && npm test

# Worker 단위 테스트만
cd workers/email-router && npm run test:unit

# Worker 통합 테스트만 (Miniflare 필요)
cd workers/email-router && npm run test:integration

# Extension 테스트 (전체)
cd extension && npm test

# Extension 테스트 (watch 모드)
cd extension && npm run test:watch
```

### 8.5 CI 파이프라인

`.github/workflows/ci.yml`에서 4개 작업 실행:
1. **Worker**: typecheck + 132 unit/integration 테스트
2. **Extension**: typecheck + 156 unit/component 테스트 + production 빌드 검증 (dev artifact 누출 방지)
3. **iOS**: xcodegen + xcodebuild unsigned smoke test (macOS-15 runner)
4. **macOS**: xcodegen + xcodebuild unsigned smoke test (macOS-15 runner)

Production 빌드 검증:
- `diag-*`, `real-popup-*` 파일이 dist에 포함되지 않는지 확인
- `popup.js`에 `demo:` 토큰이 포함되지 않는지 확인
