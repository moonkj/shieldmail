/**
 * Unit tests for keywords.ts regex dictionaries (KO/EN).
 */
import { describe, it, expect } from "vitest";
import {
  SIGNUP_TEXT,
  LOGIN_TEXT,
  CONFIRM_PWD_TEXT,
  TERMS_TEXT,
  NEWSLETTER_TEXT,
  SOCIAL_LOGIN_TEXT,
  SIGNUP_URL,
  EMAIL_FIELD_HINT,
} from "../../../src/content/detect/keywords";

describe("SIGNUP_TEXT", () => {
  it("matches English variants", () => {
    for (const s of ["Sign up", "sign-up", "Register", "Create an account", "Get started", "Join now"]) {
      expect(SIGNUP_TEXT.test(s)).toBe(true);
    }
  });
  it("matches Korean variants", () => {
    for (const s of ["회원가입", "가입", "계정 생성", "신규가입", "등록하기"]) {
      expect(SIGNUP_TEXT.test(s)).toBe(true);
    }
  });
  it("does NOT match 'Log in'", () => {
    expect(SIGNUP_TEXT.test("Log in")).toBe(false);
  });
});

describe("LOGIN_TEXT", () => {
  it("matches EN/KO login phrases", () => {
    for (const s of ["Sign in", "Log in", "login", "forgot password", "로그인", "비밀번호 찾기", "비밀번호 재설정"]) {
      expect(LOGIN_TEXT.test(s)).toBe(true);
    }
  });
  it("does NOT match 'Sign up'", () => {
    expect(LOGIN_TEXT.test("Sign up")).toBe(false);
  });
});

describe("CONFIRM_PWD_TEXT", () => {
  it("matches 'confirm', 're-enter', '비밀번호 확인'", () => {
    expect(CONFIRM_PWD_TEXT.test("confirm password")).toBe(true);
    expect(CONFIRM_PWD_TEXT.test("re-enter password")).toBe(true);
    expect(CONFIRM_PWD_TEXT.test("비밀번호 확인")).toBe(true);
    expect(CONFIRM_PWD_TEXT.test("재입력")).toBe(true);
  });
});

describe("TERMS_TEXT", () => {
  it("matches terms/privacy/consent and KO equivalents", () => {
    for (const s of ["Terms of Service", "Privacy Policy", "이용약관", "개인정보", "동의"]) {
      expect(TERMS_TEXT.test(s)).toBe(true);
    }
  });
});

describe("NEWSLETTER_TEXT", () => {
  it("matches newsletter/구독/subscribe", () => {
    expect(NEWSLETTER_TEXT.test("Subscribe to our newsletter")).toBe(true);
    expect(NEWSLETTER_TEXT.test("뉴스레터 구독")).toBe(true);
  });
  it("does NOT match plain 'Sign up'", () => {
    expect(NEWSLETTER_TEXT.test("Sign up")).toBe(false);
  });
});

describe("SOCIAL_LOGIN_TEXT", () => {
  it("matches 'Continue with Google'", () => {
    expect(SOCIAL_LOGIN_TEXT.test("Continue with Google")).toBe(true);
  });
  it("matches 'Sign up with Apple'", () => {
    expect(SOCIAL_LOGIN_TEXT.test("Sign up with Apple")).toBe(true);
  });
});

describe("SIGNUP_URL", () => {
  it("matches /signup, /register, /join", () => {
    expect(SIGNUP_URL.test("/signup")).toBe(true);
    expect(SIGNUP_URL.test("/users/register")).toBe(true);
    expect(SIGNUP_URL.test("/join/abc")).toBe(true);
  });
  it("does NOT match /login", () => {
    expect(SIGNUP_URL.test("/login")).toBe(false);
  });
});

describe("EMAIL_FIELD_HINT", () => {
  it("matches email/이메일/mail_address", () => {
    expect(EMAIL_FIELD_HINT.test("email")).toBe(true);
    expect(EMAIL_FIELD_HINT.test("이메일")).toBe(true);
    expect(EMAIL_FIELD_HINT.test("mail_address")).toBe(true);
  });
  it("does NOT match username", () => {
    expect(EMAIL_FIELD_HINT.test("username")).toBe(false);
  });
});
