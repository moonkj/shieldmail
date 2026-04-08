# ShieldMail — Tasklist

> 팀 전체 공유 진행 상황 추적 문서. 리더(아키텍트)와 모든 팀원이 실시간 업데이트.

**프로젝트**: ShieldMail (Safari Extension + Cloudflare Email Routing)
**리더**: Architect (UX/UI + 전체 설계 + 통합 + 최종 판단)
**현재 라운드**: R1 (초기 설계)
**마지막 업데이트**: 2026-04-08

---

## Stage 진행 현황

| 단계 | 담당 | 상태 | 산출물 | 비고 |
|---|---|---|---|---|
| 0. 킥오프 & 문서 세팅 | Architect (리더) | ✅ 완료 | Tasklist.md, process.md, MEMORY | — |
| 1. UX 설계 | UX Designer | ✅ 완료 (초안) | 시나리오 A/B/C, 와이어프레임 텍스트, 예외 상태, 우선순위 | UX_SPEC.md 상세화는 다음 단계 |
| 2. Architect 설계 | Architect | ✅ 완료 (초안) | ARCHITECTURE.md (통합본) | 4개 에이전트 리서치 병합, 4개 충돌 토론 해결 |
| 2.5. 기술 리서치 (병렬) | Detection / Email | ✅ 완료 | 감지 휴리스틱 + OTP/링크 파이프라인 | ARCHITECTURE.md에 통합됨 |
| 3. 코드 작성 (M1 Worker) | Teammate 1 (Coder) | ⏳ 대기 | Hono 라우터, Email Worker, postal-mime 통합 | ARCHITECTURE 승인 후 시작 |
| 4. 디버깅 | Teammate 2 (Debugger) | ⏳ 대기 | 버그 리포트 & 수정 제안 | 오류 없으면 생략 |
| 5. 테스트 | Teammate 3 (Test Engineer) | ⏳ 대기 | Vitest unit, Miniflare worker test, Playwright popup e2e | — |
| 6. 리뷰 | Teammate 3 (Reviewer) | ⏳ 대기 | 코드 리뷰 결과 | 개선시 R2 진입 |
| 7. 성능·최적화 | Teammate 4 (Perf) | ⏳ 대기 | Optional — polling backoff, DO 비용 | 요청시에만 |
| 8. 문서화 | Teammate 4 (Doc) | ⏳ 대기 | README, privacy policy, install guide | 최종 정리 시 |

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

## 미해결 기술 이슈 (Scientific Debate 대기)

> 다음 라운드 또는 구현 중 팀원이 조사/반박할 대상.

| # | 이슈 | 담당 (제안) | 가설 / 필요 검증 |
|---|---|---|---|
| O1 | Email Worker CPU/메모리 한도 대용량 HTML | Email Researcher | Cloudflare Docs 확인 + stream 파싱 벤치마크 |
| O2 | App Store 심사 `<all_urls>` 권한 리젝 리스크 | Architect + UX | 유사 확장(Bitwarden, 1Password) Privacy Policy 벤치마킹 |
| O3 | Rate limit: Turnstile 삽입 여부 | Architect | 개발자 타겟 마찰 vs abuse 시뮬레이션 |
| O4 | 도메인 로테이션 자동화 트리거 | Detection + Architect | Bounce rate / delivery rate 모니터링 임계값 |
| O5 | Alias 충돌 확률 | Email | `crypto.randomUUID().slice(0,10)` 충돌 확률 수학적 증명 + 재시도 로직 |

---

## 교차 레이어 영향 기록

| 일자 | 변경 | 원인 | 영향 받는 팀원 |
|---|---|---|---|
| 2026-04-08 | 실시간 전달을 Polling→하이브리드(SSE/WS+Polling)로 결정 | D1 토론 | Coder (DO에 WS/SSE 엔드포인트 추가), Debugger (두 경로 테스트) |
| 2026-04-08 | Alias 모드 분리 (ephemeral / managed) | D4 토론 | Coder (KV 스키마), UX Designer (온보딩 모드 선택 추가) |
| 2026-04-08 | 활성화 임계값 `0.55`→`0.70` | D2 토론 | Detection 모듈 상수, UX (dim 아이콘 제거) |

---

## 라운드 히스토리

- **R1** (2026-04-08) — 초기 설계 완료. UX + Architect + Detection + Email Processing 4개 병렬 리서치 → Architect가 통합 → `ARCHITECTURE.md` 산출. 4개 논쟁 해결. **다음**: M1 Worker 구현 시작 (Coder) 또는 UX_SPEC.md 상세화 먼저 할지 리더 판단.
