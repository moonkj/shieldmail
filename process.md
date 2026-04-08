# ShieldMail — Process Log

> 리더(Architect)가 구현 단계마다 업데이트하는 진행 기록. Tasklist.md는 "무엇을", process.md는 "언제/어떻게/왜".

---

## 2026-04-08 — Stage 0: 킥오프

### 수행
- 팀 구성 & 워크플로우를 장기 메모리에 저장 (`shieldmail_team_workflow.md`).
- 제품 비전을 장기 메모리에 저장 (`shieldmail_product_vision.md`).
- 프로젝트 디렉터리에 `Tasklist.md`, `process.md` 생성.

### 결정
- **병렬 실행 방식**: tmux는 시스템에 미설치. Agent tool의 네이티브 parallel tool calls로 병렬 팀 실행. (tmux 설치는 사용자 승인 대기 중이며 시각화 용도로만 필요.)
- **현재 라운드**: R1.

---

## 2026-04-08 — Stage 1+2: UX + Architect 병렬 리서치

### 수행
4개 에이전트를 **동시 가동**:
1. **UX Designer** — 시나리오, 와이어프레임, 예외 상태, 논쟁거리 2개 제기
2. **Solution Architect** — 시스템 다이어그램, 기술 스택, API, 마일스톤, 미해결 이슈 4개 제기
3. **Detection Logic Researcher** — 12개 가중 시그널 + 멀티게이트 조합, 10개 테스트 케이스
4. **Email Processing Researcher** — OTP/링크 추출 파이프라인, Email Worker 구현, 악용 벡터

### 과학적 토론으로 해결한 충돌
리더가 4개 논쟁을 중재:
- **D1 (실시간 전달)**: Polling vs WebSocket → **하이브리드** 해결 (Popup=SSE/WS, Background=polling)
- **D2 (감지 임계값)**: UX 0% FP vs Detection 0.55 → **UX 우선** 0.70 하드 게이트
- **D3 (OTP 자동 복사)**: 개발자 vs 일반 사용자 니즈 차이 → **온보딩 모드 분리**
- **D4 (Alias TTL)**: 10분 vs 영구 → **alias 수명과 메시지 TTL 분리**

자세한 중재 근거: `docs/ARCHITECTURE.md` §1.

### 산출물
- `docs/ARCHITECTURE.md` — R1 통합 설계 문서 (10개 섹션)
- `Tasklist.md` R1 업데이트 — Stage 상태, 논쟁 결과, 미해결 이슈 5개, 교차 레이어 영향

### 교차 레이어 영향
- D1 해결로 Coder는 DO에 WS+SSE+polling 3개 엔드포인트 구현 필요
- D4 해결로 KV 스키마에 `mode` 필드 추가 (ephemeral/managed)
- D2 해결로 Detection 모듈 상수 `ACTIVATION_THRESHOLD = 0.70` 확정

### 미해결 이슈 (다음 라운드 조사 대상)
O1~O5 (Tasklist.md 참조): Email Worker 한도, App Store 리젝 리스크, Rate limit, 도메인 로테이션 자동화, Alias 충돌 확률.

### 다음 단계
**리더 판단 필요**: M1 Worker 구현을 바로 Coder에게 넘길지, 아니면 UX_SPEC.md 상세화 → M1 병행 여부.

**권장**: M1 Worker 구현을 먼저 시작 (백엔드가 준비되어야 Extension이 의미있는 테스트 가능). UX_SPEC.md는 M2 Extension 착수 전에 완료하면 됨.

### 오픈 질문 (사용자 확인 대기)
1. Git 저장소 초기화 후 M1부터 실제 코드 작성 진행할까요? 아니면 설계 문서 검토 먼저 원하시나요?
2. GitHub 커밋 연동은 git repo를 언제 초기화할지 결정 필요 (현재 `/Users/kjmoon/ShieldMail`은 비어있고 git 저장소 아님).
3. Cloudflare 계정/도메인 준비 상태 확인 필요 (실제 배포 테스트 시).
