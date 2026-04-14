// Korean copy strings — sourced verbatim from docs/UX_SPEC.md §5.
export const ko = {
  appTitle: "ShieldMail",
  header: {
    settings: "설정",
    back: "뒤로",
  },
  main: {
    sectionAddress: "임시 주소",
    sectionOtp: "OTP",
    sectionVerify: "인증 링크",
    copy: "복사",
    copied: "복사됨 ✓",
    emptyState: "이 페이지에서 Shield Mode를 사용해보세요",
    generateNew: "새 주소 생성",
    openManaged: "Managed Mode 열기",
    openVerify: "인증 링크 열기",
    verifyWarning: "⚠ 이 링크는 알 수 없는 발신자에서 왔습니다. 열어도 안전한지 확인하세요.",
    waiting: "메일을 기다리는 중...",
    ttlRemaining: (mmss: string) => `이 주소 만료까지 ${mmss}`,
    expired: "만료됨",
    lowConfidence: "낮은 신뢰도",
  },
  onboarding: {
    step1Title: "ShieldMail",
    step1Tagline: "가입 스트레스, 자동화로 끝냅니다",
    step1Body: "가입 스트레스를 제거합니다. 방패 아이콘을 누르면 임시 주소가 즉시 채워집니다.",
    step1Cta: "시작하기",
    step2Title: "어떻게 사용하시나요?",
    modeDev: "개발/QA 테스트 — 빠른 반복",
    modeEveryday: "일상 가입 보호 — 스팸 차단",
    next: "다음 →",
    step3Title: "거의 다 됐어요",
    step3Body:
      "ShieldMail이 페이지에서 이메일 필드를 감지하도록 허용해주세요.",
    openSafariSettings: "Safari 설정 열기",
    finish: "권한 허용",
  },
  managed: {
    title: "Managed Mode",
    searchPlaceholder: "사이트 또는 주소 검색...",
    tags: {
      all: "전체",
      work: "업무",
      shopping: "쇼핑",
      qa: "QA테스트",
      newsletter: "뉴스레터",
      addTag: "+ 태그 추가",
    },
    empty:
      "저장된 주소가 없습니다. 가입할 때 방패 아이콘에서 'Managed Mode에 저장'을 누르면 여기에 나타납니다.",
    noMail: "메일 없음",
    lastMail: (when: string) => `마지막 메일: ${when}`,
    detailNote: "M2에서는 최근 메일 1건만 TTL 동안 유지됩니다.",
    delete: "삭제",
  },
  settings: {
    title: "설정",
    userMode: "사용 모드",
    developer: "개발/QA 테스트",
    everyday: "일상 가입 보호",
    autoCopy: "OTP 자동 복사",
    managedMode: "Managed Mode 기본 저장",
    domainPool: "도메인 풀 정보",
    apiBaseUrl: "API Base URL",
    openSource: "오픈소스 저장소 (GitHub)",
    version: "버전",
    resetOnboarding: "온보딩 다시 보기",
  },
  errors: {
    rate_limited: "너무 많은 요청이에요. 잠시 후 다시 시도해주세요.",
    token_revoked: "세션이 만료되었습니다. 새 주소를 생성해주세요.",
    alias_expired: "이 주소는 만료되었습니다.",
    network_unavailable: "네트워크 연결을 확인해주세요.",
    domain_blocked:
      "이 사이트는 ShieldMail 주소를 거부합니다. 다른 방법을 시도해주세요.",
    unknown: "알 수 없는 오류가 발생했습니다.",
    retry: "다시 시도",
    newAlias: "새 주소 생성",
    fallback: "가이드 보기",
  },
  privacy: {
    footer:
      "메일 내용은 저장되지 않습니다. OTP·링크만 최대 10분간 메모리에 임시 보관 후 자동 삭제됩니다.",
  },
};

// Widen literal types so en.ts can supply different strings.
type Widen<T> = T extends string
  ? string
  : T extends (...args: infer A) => infer R
    ? (...args: A) => R
    : { [K in keyof T]: Widen<T[K]> };

export type Messages = Widen<typeof ko>;
