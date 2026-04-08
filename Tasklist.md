# ShieldMail — Tasklist

> 팀 전체 공유 진행 상황 추적 문서. 리더(아키텍트)와 모든 팀원이 실시간 업데이트.

**프로젝트**: ShieldMail (Safari Extension + Cloudflare Email Routing)
**리더**: Architect (UX/UI + 전체 설계 + 통합 + 최종 판단)
**현재 라운드**: R2 (M1 완료)
**마지막 업데이트**: 2026-04-08

---

## Stage 진행 현황

| 단계 | 담당 | 상태 | 산출물 | 비고 |
|---|---|---|---|---|
| 0. 킥오프 & 문서 세팅 | Architect (리더) | ✅ 완료 | Tasklist.md, process.md, MEMORY | — |
| 1. UX 설계 | UX Designer | ✅ 완료 (R1) | 시나리오 A/B/C, 와이어프레임 텍스트, 예외 상태, 우선순위 | UX_SPEC.md 상세화는 M2 전 |
| 2. Architect 설계 | Architect | ✅ 완료 (R1) | ARCHITECTURE.md (통합본) | 4개 에이전트 리서치 병합, 4개 충돌 토론 해결 |
| 2.5. 기술 리서치 (병렬) | Detection / Email | ✅ 완료 (R1) | 감지 휴리스틱 + OTP/링크 파이프라인 | ARCHITECTURE.md에 통합됨 |
| 3. M1 코드 작성 | Teammate 1 (Coder) | ✅ 완료 (R1→R2→R3) | `workers/email-router/` 18개 src 파일 | R1 초안 → R2(Debugger 수정) → R3(Reviewer 개선) |
| 4. M1 디버깅 | Teammate 2 (Debugger) | ✅ 완료 (R1) | 10건 버그 목록 (BLOCKER 0, HIGH 4, MED 6) | Privacy invariant 100% 통과 |
| 5. M1 테스트 | Teammate 3 (Test Engineer) | ✅ 완료 (R1) | 118 테스트 케이스 (Vitest + Miniflare) | HIGH-2/3/4 회귀 + Privacy-1/2/3 검증 |
| 6. M1 리뷰 | Teammate 3 (Reviewer) | ✅ 완료 (R1→R2 승인) | R1 verdict=🔁 R2 → R2 verdict=✅ 승인 | 5개 IMP 사이클 후 최종 승인 |
| 7. 성능·최적화 | Teammate 4 (Perf) | ⏳ 대기 | M4에서 DO 요금/polling 튜닝 | 요청시에만 |
| 8. 문서화 | Teammate 4 (Doc) | ⏳ 대기 | README, privacy policy, install guide | M5 릴리즈 전 |
| **NEXT. M2 Safari Extension (macOS)** | Architect → Coder | ⏳ 대기 | Content script 감지 모듈, Popup UI, Background | M1 merge 후 착수 |

범례: ⏳ 대기 / 🟡 진행중 / ✅ 완료 / 🔁 복귀 / ⚠️ 블로커

---

## 과학적 토론 결과 (R1)

| # | 논쟁 주제 | 제기자 | 리더 판정 |
|---|---|---|---|
| D1 | 실시간 전달: Polling vs WebSocket | Architect vs Email Researcher | **하이브리드**: Popup은 SSE/WS, Background는 polling. Popup이 주 경로. |
| D2 | 감지 임계값: FP 0% vs Recall | UX Designer vs Detection Researcher | **UX 우선**: R1은 `score>=0.70` 하드 게이트, dim 아이콘 없음. M4+에서 텔레메트리 기반 A/B. |
| D3 | OTP 자동 복사 기본값 | UX Designer | **모드 분리**: 온보딩에서 "개발자/일상" 선택 → 개발자=자동 ON, 일상=수동. 설정에서 토글. |
| D4 | Alias TTL vs Managed Mode 연속성 | Architect vs Email Researcher vs UX | **분리**: alias 수명 (ephemeral 1h / managed 영구) vs 메시지 TTL (10분). Managed alias도 메시지는 10분. |

---

## M1 품질 사이클 (R1 → R2 → 승인)

### Debugger (R1) 발견 → Coder R2 수정
- **HIGH-2**: 8-digit 날짜 false-positive (`20240331`) → DATE8_RE + skipCandidate set
- **HIGH-3**: HubSpot `__hssc`/`__hstc` 추적 파라미터 미제거 → 정규식 확장
- **HIGH-4**: DO `alarm()` race (신규 메시지 즉시 삭제 가능) → 개별 메시지 TTL 검사 + 재무장
- **MEDIUM-3**: Rate limit `cost > capacity` 무한 거부 → 400 short-circuit
- **MEDIUM-4**: label 빈 문자열 통과 → `length > 0` 요구
- **MEDIUM-5**: KV `expirationTtl` 60초 미만 → `Math.max(60, ...)` clamp
- **MEDIUM-7**: `email.ts` try/catch 누락 (bounce 위험) → 상수 문자열 로그만, silent drop

### Reviewer (R1) 발견 → Coder R3 개선
- **IMP-1 [MAJOR]**: OTP 다국어 사전 (`验证码`, `驗證碼`, `確認コード`, `認証番号`) 추가
- **IMP-2 [MAJOR]**: Standalone `\bcode\b` 키워드 + compound 중복 카운트 방지 (two-pass 스코어링)
- **IMP-3 [MINOR]**: `MESSAGE_TTL_MS` env var 실제 wiring (wrangler 값 반영)
- **IMP-4 [MINOR]**: `postal-mime` DI seam (M4 telemetry + 테스트 용이성)
- **IMP-5 [NIT]**: TODO 태깅 규약 문서화 (`TODO(<severity-id>/<milestone>): ...`)

### Reviewer R2 최종: ✅ 모든 개선 완료 → M1 최종 승인
Privacy invariant, sanitize, catch 블록, 타입 엄격성 모두 회귀 없음 확인.

---

## 미해결 기술 이슈 (다음 라운드 조사 대기)

| # | 이슈 | 담당 (제안) | 가설 / 필요 검증 | 마일스톤 |
|---|---|---|---|---|
| O1 | Email Worker CPU/메모리 한도 대용량 HTML | Email Researcher | Cloudflare Docs + stream 파싱 벤치마크 | M4 |
| O2 | App Store 심사 `<all_urls>` 권한 리젝 리스크 | Architect + UX | Bitwarden/1Password Privacy Policy 벤치마킹 | M5 |
| O3 | Rate limit: Turnstile 삽입 여부 | Architect | 개발자 마찰 vs abuse 시뮬레이션 | M4 |
| O4 | 도메인 로테이션 자동화 트리거 | Detection + Architect | Bounce rate 임계값 | M4 |
| O5 | Alias 충돌 확률 (`crypto.randomUUID().slice(0,10)`) | Email | 수학적 증명 + 재시도 로직 | M3 전 |
| HIGH-1 | HMAC key 모듈 전역 캐시 race (secret rotation) | Security | M4 secret rotation 설계와 함께 재검토 | M4 |
| MED-1/2 | SSE 재연결 dedup + replay race (`Last-Event-ID`) | Coder | M4 SSE hardening | M4 |
| B-1/B-2 잔존 | OTP 엣지 케이스 | Coder | 일부 수정, 일부 accept. Production 텔레메트리로 재평가 | M5 |
| B-3 해결 | 다국어 OTP 키워드 누락 | Coder | R3에서 중/일 추가 완료 | ✅ |

---

## 교차 레이어 영향 기록

| 일자 | 변경 | 원인 | 영향 받는 팀원 |
|---|---|---|---|
| 2026-04-08 | 실시간 전달 하이브리드 (SSE/WS+Polling) | D1 토론 | Coder, Debugger |
| 2026-04-08 | Alias 모드 분리 (ephemeral / managed) | D4 토론 | Coder, UX Designer (온보딩) |
| 2026-04-08 | 활성화 임계값 `0.70` 하드 게이트 | D2 토론 | Detection 모듈, UX (dim 아이콘 제거) |
| 2026-04-08 | `MESSAGE_TTL_MS` env 주입 경로 | IMP-3 | 운영자 (wrangler.toml 수정 시 effective) |
| 2026-04-08 | `handleEmail` DI seam | IMP-4 | M4 Telemetry Engineer, Test Engineer |

---

## 라운드 히스토리

- **R1** (2026-04-08 오전) — 초기 설계 완료. UX + Architect + Detection + Email Processing 4개 병렬 리서치 → Architect가 통합 → `ARCHITECTURE.md` 산출. 4개 논쟁 해결.
- **R2** (2026-04-08 오후) — M1 Worker 구현 사이클. Coder R1 → Debugger (HIGH 4건) → Coder R2 → Test Engineer (118 tests) → Reviewer R1 (🔁) → Coder R3 (IMP 5건) → Reviewer R2 (✅ 승인). **M1 최종 완료**.
- **R3** (예정) — M2 Safari Extension (macOS) 착수. UX_SPEC.md 상세화 병행 가능.
