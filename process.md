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

### 다음 단계 후보 (리더 판단 대기)
1. **M3 iOS Safari Extension** — Swift native container + iOS floating button (UX_SPEC §2 참조)
2. **M2 백로그 핫픽스** — shortcutLabel 플랫폼 분기, PrivacyFooter interval clear, forms.ts 주석 정정
3. **O5 alias 충돌 확률 증명** — M3 진입 전 필수
