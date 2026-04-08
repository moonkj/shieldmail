# ShieldMail — Architecture (R1)

> **작성자**: Architect (팀 리더) / **라운드**: R1 초안
> **참여자**: UX Designer, Solution Architect, Detection Logic Researcher, Email Processing Researcher
> **일자**: 2026-04-08

이 문서는 4개 병렬 에이전트의 리서치를 통합하고, 충돌을 과학적 토론 방식으로 해결한 **최종 통합 설계**입니다.

---

## 0. 제품 포지셔닝 (재확인)

"임시 이메일 서비스"가 아님. **"가입 스트레스를 제거하는 자동화 인프라"**.
- 1차 타겟: 개발자/QA
- 2차 타겟: 일반 사용자 (스팸 회피)
- 플랫폼: Safari Web Extension (macOS + iOS) + Cloudflare 서버리스 백엔드

---

## 1. 과학적 토론 결과 (Scientific Debate)

### 논쟁 1: 실시간 메일 전달 방식 (Polling vs WebSocket)

**Solution Architect 입장**: Short polling (2s → backoff 10s → 5분 후 중단). 이유: Safari Web Extension Manifest V3의 background service worker는 이벤트 기반이며 persistent connection 부적합. SSE는 iOS background에서 불안정. Polling이 구현 단순·요금 예측 가능.

**Email Processing Researcher 입장**: Durable Object Hibernatable WebSocket 권장. 이유: 즉시 전달, hibernation API로 비용 낮음.

**🟢 리더 판정 (하이브리드)**:
> 양쪽 모두 부분적으로 옳음. **두 레이어에 다른 방식을 적용**한다.
> - **Popup UI가 열려있을 때** (사용자가 OTP를 기다리는 순간) → Popup에서 `EventSource`(SSE) 또는 `WebSocket`으로 DO에 직접 연결. Popup 자체가 live 상태이므로 lifecycle 문제 없음.
> - **Background script** → short polling (2s, exponential backoff to 10s, 2분 후 중단). Popup이 닫힌 상태에서 백업용.
> - **이유**: 사용자 체감 지연(OTP 대기)은 Popup 열림 상태에서 발생하므로 Popup이 즉시 전달의 주 경로. Background polling은 notification badge 용도.

**구현 영향**:
- Email Worker → DO `push()` (변경 없음)
- DO는 WebSocket/SSE 엔드포인트 + Polling 엔드포인트 둘 다 노출
- Coder는 `AliasChannel` DO에 두 프로토콜 모두 구현

---

### 논쟁 2: False Positive 임계값 (UX 신뢰 vs Recall)

**UX Designer 입장 (Q1)**: FP 0% 우선. 로그인 폼에 아이콘 뜨면 신뢰 붕괴. 감지 실패 시 ⌘⇧E 단축키 + 툴바 버튼 fallback.

**Detection Researcher 입장**: `score >= 0.55` 이상 표시, `0.55~0.75`는 50% opacity dim 아이콘 + 툴팁으로 "가입 폼으로 보입니다" 모호성 전달.

**🟢 리더 판정 (UX 우선 + 기술적 안전장치)**:
> UX Designer 우선. Dim 아이콘 아이디어는 좋으나, **초기 배포(M1~M3)에서는 보수적**으로 간다.
> - **활성화 임계값**: `score >= 0.70` (하드 게이트, dim 상태 없음)
> - **음수 시그널 강제**: S11(login/forgot/reset 단독 존재) 매칭되면 **무조건 reject** (어떤 positive score도 무시)
> - **Fallback UX**: 감지 실패 시 툴바 버튼 + ⌘⇧E 단축키 + iOS는 Long-press 시 Share Sheet 액션
> - **Phase 2 (M4+)**: 텔레메트리(opt-in, 익명, 해시만) 수집 → FP/FN 통계 확보 후 dim 아이콘 A/B 테스트
> - **이유**: 1차 타겟이 개발자이고, 개발자는 단축키를 환영함. "false positive는 복구 불가능하게 신뢰를 해치지만 false negative는 fallback이 있다."

**구현 영향**:
- Detection 모듈 임계값 상수: `ACTIVATION_THRESHOLD = 0.70`, `HARD_REJECT_ON_NEGATIVE = -0.30`
- 카테고리 다양성 요구(2개 이상) 유지
- 단축키 등록: `commands.shieldmail.generate = "Ctrl+Shift+E" (macOS: "Cmd+Shift+E")`

---

### 논쟁 3: OTP 자동 클립보드 복사 (UX Q2)

**UX Designer 입장**: 개발자는 자동 ON 선호, 일반 사용자는 iOS 클립보드 알림 우려로 수동 OFF 선호. 분리 정책 필요?

**🟢 리더 판정 (사용자 모드 기반 자동 조정)**:
> 설치 온보딩에서 **1개 질문**으로 해결: "어떤 용도로 사용하시나요? [개발/QA 테스트] [일상 가입 보호]"
> - **개발자 모드**: OTP 자동 복사 ON, Managed Mode 기본 OFF (너무 많은 기록), 단축키 힌트 노출
> - **일상 모드**: OTP 자동 복사 OFF (탭해서 복사), Managed Mode 기본 ON, 카피 톤 friendly
> - 설정에서 언제든 개별 토글 가능. 모드는 "preset"일 뿐.

---

### 논쟁 4: Alias TTL 및 연속성

**Architect 입장**: 기본 TTL 10분, "extend" 버튼으로 최대 24시간.
**Email Processor 입장**: DO 메시지 5분 TTL.
**UX 시나리오 C**: 2주 전 가입한 사이트의 비밀번호 재설정 메일 기대 (Managed Mode).

**🟢 리더 판정 (alias 자체와 메시지 스토리지를 분리)**:
> 두 개념을 명확히 분리한다.
> - **Alias 자체의 수명**: 사용자가 "Managed Mode에 저장"을 선택한 alias는 **영구** (사용자 삭제 전까지 도메인 풀 내 유효). 일회성 alias는 기본 **1시간** TTL.
> - **메시지 저장 TTL**: 개별 이메일 수신 후 `AliasChannel` DO에 **10분**. 사용자가 "확인" 버튼 누르면 즉시 삭제.
> - **Managed Mode alias로 수신**: alias는 살아있지만 메시지 자체는 여전히 10분만 유지. 재설정 메일은 사용자가 앱을 열어 polling하는 그 시점에만 보관.
> - **UX 시나리오 C 대응**: 2주 후에도 `notion-work@shld.me` 주소는 유효 → 재설정 메일 발송 시점에 앱 열어서 수신하면 OK.

**구현 영향**:
- `ALIAS_KV` 레코드에 `mode: "ephemeral" | "managed"` 필드 추가
- Ephemeral: `expirationTtl: 3600`
- Managed: TTL 없음, 사용자 명시적 삭제 시 `KV.delete`
- Email Worker는 수신 시 KV 조회로 alias 유효성 검증

---

## 2. 사용자 시나리오 (UX Designer 산출물 확정)

1. **시나리오 A (개발자 반복 테스트)**: QA가 50회 가입 테스트. 방패 아이콘 → 클릭 → `qa-staging-042@shld.me` 즉시 주입 → OTP 자동 복사 → 다음 반복. 1회 90s → 12s.
2. **시나리오 B (일반 사용자 스팸 회피)**: 쿠폰 가입 시 focus → floating 버튼 → 주소 주입 → 인증 링크 버튼 탭 → 새 탭 열림.
3. **시나리오 C (Managed Mode)**: "어디 가입했지?" 재방문. iOS 앱 → 검색 → 카드 → 재설정 메일 대기 → Push 알림.

자세한 와이어프레임은 `docs/UX_SPEC.md` (다음 섹션에서 작성).

---

## 3. 시스템 아키텍처 (Solution Architect 산출물 확정)

```
┌─────────────────── Safari Web Extension ─────────────────┐
│ Popup UI (Preact+TS)       ◄─ SSE/WS ─┐                  │
│ Content Script (TS)                    │                  │
│   - Detection heuristic               │                  │
│   - Field injector (MutationObserver) │                  │
│   - Icon renderer                     │                  │
│ Background Service Worker              │                  │
│   - Polling fallback                   │                  │
│   - API client (HMAC)                  │                  │
│ iOS Native Container (Swift)           │                  │
│   - Keychain bridge                    │                  │
└────────────────┬───────────────────────┼──────────────────┘
                 │                        │
                 │ HTTPS JSON              │ WebSocket/SSE
                 ▼                        ▼
┌────────── Cloudflare Workers (api.shld.me) ──────────────┐
│ Hono Router                                               │
│  POST /alias/generate                                     │
│  GET  /alias/:id/messages   (polling fallback)            │
│  GET  /alias/:id/stream     (SSE)                         │
│  WS   /alias/:id/ws         (WebSocket via DO)            │
│  POST /alias/:id/ack                                      │
│  DELETE /alias/:id                                        │
│ Bindings:                                                 │
│  ALIAS_KV      KV  (alias index, TTL or permanent)        │
│  MSG_DO        DO  AliasChannel (messages + WS + alarm)   │
│  RATE_LIMIT    DO  TokenBucket                            │
│  SECRETS       env HMAC_KEY, DOMAIN_POOL, SENTRY_DSN      │
└───────────┬───────────────────────────────────────────────┘
            │ internal fetch()
┌───────────┴───────────────────────────────────────────────┐
│ Email Worker (binding: email, routes: *@d1..d5.shld.me)   │
│   export default { async email(msg, env, ctx) { ... } }   │
│   - postal-mime 파싱 → OTP/링크 추출 → DO push → drop raw │
└───────────────────────────────────────────────────────────┘
            ▲
            │ MX (Cloudflare Email Routing)
     ┌──────┴──────┐
     │ Domain Pool │ d1.shld.me, d2.shld.me ... (weighted rotation)
     └─────────────┘
```

### 기술 스택

| 레이어 | 선택 |
|---|---|
| Extension (shared) | TypeScript + Preact (popup) + Web Extension MV3 API |
| iOS Container | Swift + `SFSafariExtensionHandler` + Keychain |
| Worker Runtime | TypeScript + Hono + `postal-mime` |
| Storage | Durable Object (messages, strong consistency) + KV (alias index) |
| Real-time | SSE/WebSocket from Popup + Polling from Background |
| Build | Vite for extension, Wrangler for workers |
| Test | Vitest (unit) + Playwright (e2e popup) + Miniflare (worker) |

---

## 4. 가입 맥락 감지 로직 (Detection Researcher 산출물 확정)

**게이트 기반 멀티 시그널**:

1. **Gate A**: email-like input 존재 검증 (type=email / name|id|placeholder|autocomplete 매칭 / `<label>` 텍스트 역탐색)
2. **Gate B**: 하드 거부 — S11(login/forgot/reset 단독) `<=` 매칭 → 즉시 reject
3. **점수 합산**: 12개 시그널 (S1~S10 양수, S11/S12 음수)
4. **Gate C**: 카테고리 다양성 요구 (URL/TEXT/STRUCT 중 2개 이상 category 매치)
5. **활성화 임계값**: `score >= 0.70` (R1 보수적 하드 게이트)
6. **SPA 대응**: `MutationObserver` debounce 250ms, 같은 form 재평가 3회 제한
7. **다단계 가입 대응**: `sessionStorage['shieldmail:recentSignupIntent']`에 URL/heading 해시 저장, 후속 페이지에서 +0.15 부스트 (TTL 10분)

**구체 구현 파일**:
- `extension/src/content/detect/signals.ts` (S1~S12 함수)
- `extension/src/content/detect/scorer.ts` (gate 조합)
- `extension/src/content/detect/keywords.ts` (다국어 사전)
- `extension/src/content/observer.ts` (MutationObserver)

---

## 5. 이메일 처리 파이프라인 (Email Researcher 산출물 확정)

### OTP 추출
- 다중 패턴: `\d{6}`, `\d{4}`, `\d{3}[-\s]?\d{3}`, `[A-Z0-9]{6,8}`, `\d{8}`
- 컨텍스트 윈도우(±60자)에서 키워드 점수: `인증|verification|code is|확인|OTP` (+10 ~ +8)
- 네거티브 키워드: `order|price|phone|date|amount` (-8)
- 연도 패턴 `^(19|20)\d{2}$` 배제
- `score >= 5`만 확정, confidence = `score/20` clamped

### 링크 추출
- `<a href>` 우선, 플레인텍스트 fallback
- 키워드: `verify|confirm|activate|validate|인증|확인|auth|magic`
- `https:` only, `javascript:/data:` 차단
- 추적 파라미터 제거: `utm_*`, `fbclid`, `gclid`, `mc_`, `_hs`
- 상위 3개만 반환

### Email Worker 핸들러
```ts
export default {
  async email(msg, env, ctx) {
    // 1. DKIM 검증
    if (msg.headers.get('authentication-results')?.includes('dkim=fail')) return;
    // 2. alias 유효성 (KV 조회)
    const alias = msg.to.split('@')[0];
    const record = await env.ALIAS_KV.get(`alias:${alias}`, 'json');
    if (!record) return;
    // 3. 파싱 → 추출
    const parsed = await PostalMime.parse(msg.raw);
    const otp = extractOtp(parsed.text ?? htmlToText(parsed.html));
    const links = extractLinks(parsed.html ?? '', parsed.text ?? '');
    // 4. DO push (원문 저장 X)
    const id = env.MSG_DO.idFromName(alias);
    await env.MSG_DO.get(id).fetch('https://do/push', {
      method: 'POST',
      body: JSON.stringify({ otp: otp?.code, confidence: otp?.confidence, verifyLinks: links, receivedAt: Date.now() })
    });
    // parsed/msg.raw는 스코프 종료 시 GC
  }
};
```

### 저장 정책 강제
- DO 메시지 payload 화이트리스트: `{otp, confidence, verifyLinks, receivedAt}` 외 키 금지
- ESLint 커스텀 룰 `no-persist-raw-email`: `MSG_DO` 호출 body에서 `raw|html|text|from|subject|to` 금지
- DO `setAlarm(Date.now() + 600_000)` → 자동 `deleteAll()`
- KV는 `expirationTtl` (ephemeral mode만)

---

## 6. 프라이버시 아키텍처

1. **코드 레벨**: Email Worker의 `msg.raw`는 `const` 지역변수, Worker 외부로 절대 export 금지
2. **Lint 규칙**: custom ESLint 룰로 DO/KV put payload 검사
3. **DO 자동 퍼지**: `alarm()` API로 TTL 강제
4. **투명성**: GitHub public + reproducible build hash를 릴리즈 노트에 게시
5. **Privacy policy**: "no email body stored, only regex-extracted OTP/link for max 10 minutes"
6. **UI 지속 고지**: Popup 하단에 "메일 내용은 저장되지 않습니다. OTP/링크만 10분간 메모리 보관 후 자동 삭제" 항상 표시

---

## 7. API 인터페이스

```ts
// POST /alias/generate
Req:  { mode: "ephemeral" | "managed", ttlSec?: 3600, label?: string }
Res:  { aliasId: "u8af2k3", address: "u8af2k3@d2.shld.me",
        expiresAt: 1712563200 | null, pollToken: "<jwt>" }

// GET /alias/:id/messages?since=<ts>    Authorization: Bearer <pollToken>
Res:  { messages: [{ id, otp?, confidence?, verifyLinks?, receivedAt }], expired: bool }

// GET /alias/:id/stream   (SSE)
Res:  event-stream ("message" events with same payload)

// WS /alias/:id/ws        (WebSocket, DO hibernatable)
Res:  JSON messages pushed on arrival

// POST /alias/:id/ack     (triggers DO storage delete)
// DELETE /alias/:id       (KV.delete + DO.deleteAll)
```

**에러 코드**: `429` (rate limit), `410` (expired), `404` (unknown), `401` (bad token).

---

## 8. 마일스톤

| # | 범위 | 산출물 |
|---|---|---|
| **M1** | Worker API + Email Worker + 도메인 1개 | `wrangler.toml`, `/alias/generate`, `/messages` polling, postal-mime 통합, curl 데모, OTP/링크 추출 unit test |
| **M2** | Safari Web Extension (macOS) | `.app` 로컬 빌드, content script 감지 모듈, popup UI, 주요 사이트 5개 수동 QA |
| **M3** | iOS Safari Extension + Keychain | TestFlight 빌드, floating button, focus 트리거 |
| **M4** | Managed Mode, 도메인 로테이션 2→5개, SSE/WS | IndexedDB + WebCrypto 로컬 스토어, Sentry 대시보드 |
| **M5** | App Store 심사 + 오픈소스 공개 | 재현 빌드 해시, privacy policy, Mac/iOS 릴리즈 |

---

## 9. 미해결 기술 이슈 (Tasklist에 등재)

1. **Email Worker 제약**: 메시지당 CPU/메모리 한도 → 대용량 HTML 메일 fallback 전략 검증 필요
2. **App Store 심사**: `host_permissions: <all_urls>` 리젝 리스크 → Privacy policy + 리뷰 노트 초안 필요
3. **Rate limit 전략**: Turnstile 삽입 여부 (개발자 마찰 vs abuse 방지)
4. **도메인 로테이션 자동화**: Phase 1 수동 → Phase 2 자동 트리거 조건
5. **Alias collision**: 10자 `crypto.randomUUID` slice로 충돌 확률 계산 필요. 충돌 시 재시도 전략

---

## 10. 다음 단계 (Tasklist R2 진입 전)

1. UX Designer → `docs/UX_SPEC.md` 와이어프레임 상세화
2. Architect (리더) → `extension/` 및 `workers/` 디렉터리 스캐폴드
3. Coder (Teammate 1) → M1 Worker 구현 시작
4. Debugger (Teammate 2) → 감지 로직 테스트 케이스 예측값 검증 준비
