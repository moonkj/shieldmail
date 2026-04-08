# ShieldMail — Tasklist

> 팀 전체 공유 진행 상황 추적 문서. 리더(아키텍트)와 모든 팀원이 실시간 업데이트.

**프로젝트**: ShieldMail (Safari Extension + Cloudflare Email Routing)
**리더**: Architect (UX/UI + 전체 설계 + 통합 + 최종 판단)
**현재 라운드**: R3 (M2 완료)
**마지막 업데이트**: 2026-04-08

---

## Stage 진행 현황

| 단계 | 담당 | 상태 | 산출물 | 비고 |
|---|---|---|---|---|
| 0. 킥오프 & 문서 세팅 | Architect (리더) | ✅ 완료 | Tasklist.md, process.md, MEMORY | — |
| 1. UX 설계 R1 | UX Designer | ✅ 완료 | ARCHITECTURE §2 시나리오/와이어프레임 초안 | R3에서 UX_SPEC.md로 상세화 |
| 2. Architect 설계 | Architect | ✅ 완료 | ARCHITECTURE.md 10개 섹션 | 4개 논쟁 해결 |
| **M1 Worker API + Email Worker** | Coder/Debugger/Test/Reviewer | ✅ 완료 (R2) | `workers/email-router/` 18 src + 118 tests | R1→R2→R3→R2-review 품질 사이클 |
| **M2 Safari Extension (macOS)** | 6-agent team (R3) | ✅ 완료 | `extension/` 60+ files, `docs/UX_SPEC.md`, `assets/icons/` | R1→Debugger→R2→Test→Reviewer+lead hotfix |
| **M4 SSE + 도메인 ×5 + Managed Mode 기반** | 리더 (R7) | ✅ 완료 | AliasChannel SSE 고도화, wrangler.toml 5도메인, crypto.ts/indexeddb.ts/migration.ts | commit 113443c |
| 3. 성능·최적화 | Teammate 4 (Perf) | ✅ 완료 (R8) | O1 email size guard 완료, O3 defer, O4 rotation 완료 | — |
| **M5 Wave 1** | 리더 (R8) | 🟡 진행중 | README.md 완성 | commit e1411a6 |
| 4. 문서화 | Teammate 4 (Doc) | ⏳ 대기 | 재현 빌드 해시, Mac/iOS 릴리즈 체크리스트 | M5 잔여 |
| **M3 iOS Safari Extension** | 6-agent team (R5) | ✅ 완료 | `ios/` Swift container + iOS floating button TS | Wave 1-6 완료 (Debugger BLOCKER 2건 + Reviewer MAJOR 1건 수정) |

범례: ⏳ 대기 / 🟡 진행중 / ✅ 완료 / 🔁 복귀 / ⚠️ 블로커

---

## R3 M2 — 6 에이전트 병렬 사이클

### Wave 1 (병렬): UX Designer + Icon Designer
- **UX Designer** → `docs/UX_SPEC.md` 10개 섹션 (방패 모드 시그니처 격상, ASCII 와이어프레임 7개, Mermaid 플로우 4개, KO/EN 카피, 다크 모드 토큰, WCAG AA, dev hand-off)
- **Icon Designer** → `assets/icons/` 7 파일 (color/mono-black/mono-white/gradient SVG, full/stacked 로고, README). 방패+봉투 concept, 모노 변형은 `fill-rule=evenodd` compound path. 대비비 20.35:1/17.56:1 (AAA).

### Wave 2: Architect 스캐폴드
- `extension/` — `package.json`, `tsconfig.json`, `vite.config.ts`, `manifest.json` v3, `styles/tokens.css`, `lib/types.ts`

### Wave 3 (병렬): 3 Coders
- **Coder A (Content)** → `content/detect/{signals,scorer,forms,keywords}.ts` + `index.ts` + `observer.ts` + `injector.ts` + `shieldIcon.css` + `bridge.ts`
- **Coder B (Background)** → `background/{index,api,poller,handlers,storage,notify}.ts` + `lib/messaging.ts` (extends frozen types)
- **Coder C (Popup)** → `popup/{App,index}.tsx` + 4 screens + 10 components + i18n KO/EN + state store

### Wave 4: Debugger — 🔁 R2 필요 (BLOCKER 3 + HIGH 6 + MEDIUM 9)
3개 교차 레이어 contract 불일치 발견:
- **BLOCKER #1**: `activeAliases` BG=`Record` vs Popup=`Array` → popup 항상 빈 상태
- **BLOCKER #2**: `ACK_MESSAGE` 미호출 → DO 영구 잔존 (§6 프라이버시 위배)
- **BLOCKER #3**: `manifest.json` `notifications` 권한 누락 → silent fail
- **HIGH #4**: `FETCH_MESSAGES_RESULT` 누적 vs 교체 (메시지 유실)
- **HIGH #5**: `onMessage` default `return true` → port closed warning
- **HIGH #6**: `onboardingCompleted` frozen schema 외부
- **HIGH #7**: Managed Mode tags 필드 미존재 (dead UI)
- **HIGH #8**: TokenRevoked 복구 브로드캐스트 부재
- **HIGH #9**: `setTimeout` 기반 폴링 SW eviction 불안전

### Wave 4.5 (병렬): 리더 frozen 파일 수정 + 3 Coder R2
**리더 (Architect)**:
- `types.ts` → `AliasRecord.tags?`, `ExtensionFlags` 추가
- `messaging.ts` → `PingMessage`, `PongMessage` 추가
- `manifest.json` → `notifications`, `clipboardWrite`, `alarms` 권한 추가

**Coder A R2 (Content)**: FIX-A1 FORCE_INJECT 리시버 + FIX-A2 SPA fallback 축소 + FIX-A3 InputEvent 호환
**Coder B R2 (Background)**: FIX-B1 `return false` 라우팅 + FIX-B2 `chrome.alarms` 기본 경로 + FIX-B3 TokenRevoked/AliasExpired 브로드캐스트 + FIX-B4 rehydrate 중복 방지 + FIX-B5 PING/PONG 엄격 체크
**Coder C R2 (Popup)**: FIX-C1 Record→Array 정규화 + FIX-C2 ACK 트리거 (copy/verify) + FIX-C3 merge-by-id + FIX-C4 tags 필터 활성 + FIX-C5 PONG 리스너 등록

### Wave 5: Test Engineer — 97 tests, 5 obs
- 9 test files (detect/api/components)
- R2 회귀: 로그인 페이지 거부, token_revoked, ack 트리거, alias expired
- 5 관찰: forms.ts div fallback 주석 불일치(NIT), scorer matched 배열(ACCEPT), S11 path evasion(ACCEPT), OtpBox dedup(ACCEPT), PrivacyFooter interval(FIX LATER)

### Wave 6: Reviewer — ✅ M2 승인
- 점수: 가독성 4.5/5, 유지보수 4.5/5, 확장성 4/5, 스펙 일치 4.5/5, 프라이버시 4.5/5
- 5건 관찰 모두 ACCEPT 또는 FIX LATER 판정
- **2건 MAJOR 핫픽스 백로그**: notify.ts OTP 평문 알림(프라이버시), injector.ts 전역 hotkey 이중 등록

### Lead Hotfix (커밋 전 즉시 처리)
- **notify.ts**: OS 알림 본문에서 OTP 제거 → "클릭하여 확인"만 표시 (macOS Notification Center 영구 저장 방지)
- **injector.ts**: 전역 window keydown 리스너 제거 → `manifest commands` → background `FORCE_INJECT` 단일 경로

---

## 누적 과학적 토론 결과

| # | 논쟁 | 라운드 | 리더 판정 |
|---|---|---|---|
| D1 | 실시간 전달 Polling vs WS | R1 | 하이브리드 (Popup SSE/WS + BG polling) |
| D2 | 감지 임계값 FP vs Recall | R1 | 0.70 하드 게이트 |
| D3 | OTP 자동 복사 기본값 | R1 | 모드 분리 (개발자/일상) |
| D4 | Alias TTL vs 연속성 | R1 | alias 수명 vs 메시지 TTL 분리 |
| D5 | M2 교차 레이어 storage shape | R3 | BG는 Record, Popup은 `Object.values` 정규화 |
| D6 | M2 ack 트리거 시점 | R3 | unmount 불신, copy/verify 명시 시점 |
| D7 | M2 폴러 SW eviction | R3 | chrome.alarms 주 경로 + 6s hot setTimeout |
| D8 | M2 OS 알림 OTP 노출 | Lead hotfix | 제거 (프라이버시 우선) |

---

## 미해결 기술 이슈 (롤링 누적)

| # | 이슈 | 마일스톤 | 상태 |
|---|---|---|---|
| O1 | Email Worker CPU/메모리 대용량 HTML | M4 | ✅ 완료 (R8) — HTML 200KB / text 50KB truncate |
| O2 | App Store 심사 `<all_urls>` 리젝 리스크 | M5 | ✅ 완료 (R6) — Privacy manifest + Review Notes + Privacy Policy |
| O3 | Rate limit Turnstile 삽입 | M6+ | ⏳ DEFER — TokenBucket으로 충분, 개발자 마찰 불필요 |
| O4 | 도메인 로테이션 자동화 | M4 | ✅ 완료 — pickDomain() 랜덤 rotation = 기본 자동화 완족. KV 차단 추적은 실사용 데이터 후 검토 |
| O5 | Alias 충돌 확률 증명 | M3 전 | ✅ 완료 (R4) — 10자→14자 확대 + 재시도 로직 적용 |
| HIGH-1 (M1) | HMAC key 캐시 race (secret rotation) | M5 | TODO |
| MED-1/2 (M1) | SSE dedup + replay race | M4 | ✅ 완료 (R7) — Last-Event-ID + reconnect-race fix |
| M2-bk1 | injector shortcutLabel 플랫폼 분기 | M3 전 | ✅ 완료 (R4) |
| M2-bk2 | PrivacyFooter 음수 TTL interval clear | M3 전 | ✅ 완료 (R4) |
| M2-bk3 | forms.ts SPA fallback 주석 정정 | 언제든 | ✅ 완료 (R4) |
| M2-bk4 | injector `triggerFirstVisible` dead code 제거 | 언제든 | ✅ 완료 (R4) |

---

## 라운드 히스토리

- **R1** (2026-04-08 오전) — 초기 설계, 4개 병렬 에이전트 리서치 → ARCHITECTURE.md
- **R2** (2026-04-08 오후) — **M1 Worker** 구현, 7 라운드 품질 사이클, 118 tests
- **R3** (2026-04-08 저녁) — **M2 Safari Extension** 구현, **6 agent 병렬 + R2 cycle + lead hotfix**, UX_SPEC.md + 아이콘 SVG + 97 tests
- **R4** (2026-04-08) — M2 백로그 4건 + O5 alias 충돌 수정 완료, M3 준비 완료
- **R5** (2026-04-08) — M3 iOS Safari Extension 구현: Swift container + iOS floating button + Keychain + 테스트 완료
- **R6** (2026-04-08) — O2 App Store 리젝 리스크 해소: PrivacyInfo.xcprivacy + Review Notes + Privacy Policy
- **R7** (2026-04-08) — M4 SSE 고도화 + 도메인 ×5 + Managed Mode crypto/IndexedDB/migration 기반 구축
