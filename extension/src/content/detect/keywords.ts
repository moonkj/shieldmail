/**
 * Multilingual (KO/EN) keyword dictionaries for signup context detection.
 * Used by signals.ts. All regex are case-insensitive and unicode-aware.
 */

export const SIGNUP_TEXT = /(sign[-_\s]?up|register|registration|create[-_\s]?(an[-_\s]?)?account|join[-_\s]?(us|now)?|get[-_\s]?started|가입|회원가입|신규가입|계정[-_\s]?생성|등록하기|새\s?계정)/i;

export const LOGIN_TEXT = /(sign[-_\s]?in|log[-_\s]?in|login|forgot[-_\s]?password|reset[-_\s]?password|로그인|비밀번호\s?찾기|비밀번호\s?재설정|패스워드\s?찾기)/i;

export const CONFIRM_PWD_TEXT = /(confirm|verify|repeat|re[-_\s]?enter|retype|재입력|확인|비밀번호\s?확인)/i;

export const TERMS_TEXT = /(terms|tos|agree|privacy|policy|consent|이용약관|약관|개인정보|동의|수집\s?동의)/i;

export const NEWSLETTER_TEXT = /(newsletter|subscribe|subscription|mailing[-_\s]?list|구독|뉴스레터)/i;

export const VERIFY_LINK_TEXT = /(verify|confirm|activate|validate|인증|확인|auth|magic[-_\s]?link)/i;

export const SOCIAL_LOGIN_TEXT = /((sign[-_\s]?(up|in)|continue|log[-_\s]?in)[-_\s]?with)|(Google|Apple|Facebook|GitHub|Microsoft|Kakao|Naver)로[-_\s]?(계속|로그인|가입)/i;

export const SIGNUP_URL = /(sign[-_]?up|signup|register|registration|join|create[-_]?account|onboarding|신규가입|회원가입)/i;

export const FORM_ACTION_URL = /(sign[-_]?up|register|register_user|users\.create|accounts\.create|user\/new|join|create[-_]?account)/i;

/** Email-field hints for Gate A (name/id/placeholder/autocomplete/label). */
export const EMAIL_FIELD_HINT = /(e[-_]?mail|이메일|메일주소|mail[-_]?address)/i;
