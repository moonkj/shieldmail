# ShieldMail — Process Log

> 리더(Architect)가 구현 단계마다 업데이트하는 진행 기록. Tasklist.md는 "무엇을", process.md는 "언제/어떻게/왜".

---

## 2026-04-08 — Stage 0: 킥오프

### 수행
- 팀 구성 & 워크플로우를 장기 메모리에 저장 (`shieldmail_team_workflow.md`).
- 제품 비전을 장기 메모리에 저장 (`shieldmail_product_vision.md`).
- 프로젝트 디렉터리에 `Tasklist.md`, `process.md` 생성.

### 결정
- **병렬 실행 방식**: tmux는 시스템에 미설치. Agent tool의 네이티브 parallel tool calls로 병렬 팀 실행.
- **현재 라운드**: R1.

---

## 2026-04-08 — Stage 1+2: UX + Architect 병렬 리서치 (R1)

### 수행
4개 에이전트 **동시 가동**: UX Designer / Solution Architect / Detection Logic Researcher / Email Processing Researcher.

### 과학적 토론으로 해결한 충돌
- **D1 (실시간 전달)**: Polling vs WebSocket → **하이브리드** 해결 (Popup=SSE/WS, Background=polling)
- **D2 (감지 임계값)**: UX 0% FP vs Detection 0.55 → **UX 우선** 0.70 하드 게이트
- **D3 (OTP 자동 복사)**: 개발자 vs 일반 사용자 니즈 → **온보딩 모드 분리**
- **D4 (Alias TTL)**: 10분 vs 영구 → **alias 수명과 메시지 TTL 분리**

### 산출물
- `docs/ARCHITECTURE.md` — R1 통합 설계 문서 (10개 섹션)
- `Tasklist.md` R1 업데이트

### Git 커밋
- `9f30dad docs: R1 initial design — team workflow, architecture, tasklist`

---

## 2026-04-08 — Stage 3~6: M1 Worker 구현 사이클 (R2)

### R1 Coder: M1 초안 구현
4개 에이전트 리서치 → Architect 통합 → Coder R1 투입.

**생성된 파일 (18개 src)**:
```
workers/email-router/
  package.json, tsconfig.json, wrangler.toml, README.md
  src/
    index.ts, email.ts, router.ts
    do/AliasChannel.ts, do/TokenBucket.ts
    parser/otp.ts, parser/links.ts, parser/html.ts
    lib/hash.ts, lib/jwt.ts, lib/alias.ts, lib/sanitize.ts
    types/env.ts, types/messages.ts
```

**핵심 의사결정 (Coder R1)**:
- TypeScript strict + `noUncheckedIndexedAccess`
- Hono router, DO hibernatable WS는 M4로 연기 (`throw new Error("WS hibernation — M4")` 스텁)
- `sanitizeDoPayload`를 privacy choke point으로 집중 — 금지 키는 **loud failure** (throw)
- Coder가 8개 open question을 Debugger에게 전달

### R1 Debugger: 10건 이슈 발견, BLOCKER 0
**Privacy invariant 100% 통과** (sanitize choke point + catch block 로그 최소화 + parsed 객체 spread 0건)

이슈 분류:
- **HIGH 4건**: HMAC 캐시 race (M4 deferred), OTP 8자리 날짜 FP, HubSpot `__hssc` 누락, DO `alarm()` race
- **MEDIUM 6건**: SSE 재연결 dedup (M4), SSE replay race (M4), rate limit cost guard, label 빈 문자열, KV TTL 60초 floor, `email.ts` try/catch 누락
- **LOW 4건**: 마이너

### R2 Coder: Debugger 수정 7건 일괄 적용
- FIX-1 (HIGH-2): OTP 8-digit 날짜 가드 + `skipCandidate` Set
- FIX-2 (HIGH-3): `_+hs[a-z]*|__hs[a-z]+` 정규식
- FIX-3 (HIGH-4): `alarm()` 개별 TTL 검사 + 선택적 재무장
- FIX-4 (MED-4): label 빈 문자열 → undefined
- FIX-5 (MED-5): `ttlSec` `Math.max(60, ...)` clamp
- FIX-6 (MED-7): `email.ts` try/catch + 상수 문자열 로그만
- MEDIUM-3: rate limit `cost > capacity` → 400

Deferred (TODO 태그): HIGH-1 (`hash.ts`), MED-1/2 (`AliasChannel.ts` SSE).

### R1 Test Engineer: 118 테스트 작성
- **vitest.config.ts** — unit (node) + integration (workers pool)
- **6 unit files**: otp (28), links (21), html (11), sanitize (23), jwt (11), alias (8)
- **3 integration files**: alias_channel (9, alarm race 회귀 포함), email_handler (6, privacy 검증), router (11)
- **6 fixture files** (.eml/.html)
- **3건 신규 버그 보고 (B-1 LOW, B-2 obs, B-3 MED)** — 테스트 작성 중 발견

### R1 Reviewer: 🔁 R2 verdict
5개 개선 항목 제시:
- IMP-1 [MAJOR]: B-3 다국어 사전 (중국어/일본어)
- IMP-2 [MAJOR]: B-1 standalone `code` 키워드
- IMP-3 [MINOR]: `MESSAGE_TTL_MS` env wiring
- IMP-4 [MINOR]: `postal-mime` DI seam
- IMP-5 [NIT]: TODO 태깅 규약 문서화

차원별 점수: 가독성 4.5, 유지보수성 4, 확장성 4, 스펙 일치도 4.5, 보안 5.

### R3 Coder: IMP-1~5 일괄 개선
- IMP-1: 4개 CJK 키워드 추가, 테스트 3개 플립 + 2개 신규
- IMP-2: `\bcode\b` (weight 6) + **two-pass 스코어링** (compound 매칭 시 standalone skip → 중복 카운트 방지). 테스트 1개 플립 + 2개 신규
- IMP-3: `DEFAULT_MESSAGE_TTL_MS` 폴백 + 생성자에서 env 파싱 + 인스턴스 필드 사용
- IMP-4: `HandleEmailDeps` 인터페이스 + `deps.parseEmail ?? PostalMime.parse` 폴백 (기존 caller 역호환)
- IMP-5: README.md에 "TODO Tagging Convention" 섹션 추가

### R2 Reviewer: ✅ 최종 승인
IMP-1~5 모두 정확히 적용됨. Privacy-critical 경로(sanitize, catch 블록, 로깅, `any` 타입) 회귀 없음. **M1 최종 승인**.

### 라운드별 변경 요약
| 라운드 | 팀원 | 주요 작업 | 결과 |
|---|---|---|---|
| R1 | Coder | M1 초안 18개 파일 | Debugger로 인계 |
| R1 | Debugger | 10건 발견 (BLOCKER 0) | Coder R2로 복귀 |
| R2 | Coder | 7건 수정 | Test Engineer로 인계 |
| R1 | Test Engineer | 118 테스트 + 3건 신규 버그 | Reviewer로 인계 |
| R1 | Reviewer | 5개 IMP 제시 | Coder R3로 🔁 복귀 |
| R3 | Coder | IMP-1~5 적용 | Reviewer R2로 인계 |
| R2 | Reviewer | ✅ 최종 승인 | **M1 완료** |

### 교차 레이어 영향
- `MESSAGE_TTL_MS` env wiring으로 운영자가 배포 없이 wrangler.toml로 TTL 튜닝 가능
- `handleEmail` DI seam으로 M4 Telemetry Engineer 연동 포인트 확보
- TODO 태깅 규약으로 미래 grep/검색 비용 절감

### 미해결 (다음 라운드)
- UX_SPEC.md 상세 와이어프레임 (M2 Extension 전)
- M2 Safari Extension macOS 착수
- O1~O5, HIGH-1, MED-1/2 (Tasklist.md 참조)

---

## 다음 단계

**후보**:
1. **M2 Safari Extension (macOS)** — Content Script 감지 모듈 + Popup + Background. 이어서 iOS 대응(M3).
2. **UX_SPEC.md 상세화** — M2 병행. UX Designer가 와이어프레임을 Mermaid/ASCII로 구체화.
3. **O5 (alias 충돌 확률)** — M3 전 반드시 해결.

**리더 권장**: M2 Extension 착수와 UX_SPEC.md 상세화를 병렬 진행. O5는 충돌 확률이 낮아 M3 전까지 대기 가능.
