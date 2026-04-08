import { describe, it, expect } from "vitest";
import { extractOtp } from "../../src/parser/otp.js";

/**
 * OTP extractor unit tests.
 *
 * Mirrors ARCHITECTURE.md §5 OTP rules and the FIX-1 [HIGH-2] regression.
 *
 * The extractor is a pure function over a normalised text string. We test
 * pattern coverage, scoring, language coverage, and the date guards added
 * after R-HIGH-2.
 */

describe("extractOtp — pattern coverage", () => {
  it("extracts a 6-digit code with explicit 'verification code' keyword", () => {
    const r = extractOtp("Your verification code is 824193. Do not share it.");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("824193");
    expect(r!.confidence).toBeGreaterThan(0);
    expect(r!.confidence).toBeLessThanOrEqual(1);
  });

  it("extracts a 4-digit pin with 'pin code' keyword", () => {
    const r = extractOtp("Use pin code 4829 to unlock.");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("4829");
  });

  it("extracts a 3-3 split code (123-456)", () => {
    const r = extractOtp("Your one-time password: 482-913");
    expect(r).not.toBeNull();
    // Normalised drops dash/space.
    expect(r!.code).toBe("482913");
  });

  it("extracts a 3-3 split code with space (123 456)", () => {
    const r = extractOtp("Your verification code: 482 913");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("482913");
  });

  it("extracts an alphanumeric 6-char code", () => {
    const r = extractOtp("Your access code is AB12CD. Enter it now.");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("AB12CD");
  });

  it("extracts an alphanumeric 8-char code", () => {
    const r = extractOtp("Your verification code is X1Y2Z3Q4.");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("X1Y2Z3Q4");
  });

  it("extracts an 8-digit code that is NOT a date", () => {
    // 99999999 is not a valid date — should pass DATE8 guard.
    const r = extractOtp("Your verification code is 99999999.");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("99999999");
  });

  it("returns null for whitespace input", () => {
    expect(extractOtp("   \n\t  ")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(extractOtp("")).toBeNull();
  });

  it("returns null for null/undefined input", () => {
    expect(extractOtp(null)).toBeNull();
    expect(extractOtp(undefined)).toBeNull();
  });
});

describe("extractOtp — scoring & ambiguity", () => {
  it("returns null when no keyword is present (score < threshold)", () => {
    // 6-digit number with no positive keyword: pattern bonus 3 alone is < 5.
    const r = extractOtp("The total balance is 482913 dollars.");
    expect(r).toBeNull();
  });

  it("picks the higher-scoring candidate when multiple are present", () => {
    const text =
      "Your phone number ends 1234. Your verification code is 998877. Thanks.";
    const r = extractOtp(text);
    expect(r).not.toBeNull();
    expect(r!.code).toBe("998877");
  });

  it("rejects 6-digit candidate near a strong negative (order)", () => {
    // 'order' is -8; without a positive keyword nearby, score should drop
    // below threshold and return null.
    const r = extractOtp("Your order 482913 has shipped.");
    expect(r).toBeNull();
  });

  it("clamps confidence to [0,1]", () => {
    // Stack many positive keywords to push raw score above 20.
    const r = extractOtp(
      "verification code OTP authentication code confirm verify your code is 482913",
    );
    expect(r).not.toBeNull();
    expect(r!.confidence).toBeLessThanOrEqual(1);
    expect(r!.confidence).toBeGreaterThan(0);
  });

  it("respects the ±60 char context window", () => {
    // Keyword far away from the candidate (>60 chars) → no boost.
    const padding = "x".repeat(120);
    const r = extractOtp(`verification code ${padding} 482913`);
    // Without keyword in window, only pattern bonus counts → below threshold.
    expect(r).toBeNull();
  });

  it("year guard: '2024' alone returns null", () => {
    expect(extractOtp("verification code 2024")).toBeNull();
  });

  it("year guard: '1999' alone returns null", () => {
    expect(extractOtp("verification code 1999")).toBeNull();
  });
});

describe("extractOtp — multilingual", () => {
  it("Korean: 인증번호 with 6-digit code", () => {
    const r = extractOtp("인증번호 482913을 입력해주세요");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("482913");
  });

  it("Korean: 본인 확인 keyword", () => {
    const r = extractOtp("본인 확인을 위한 코드: 998877");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("998877");
  });

  // IMP-1 [B-3]: multilang keyword expansion — these tests were previously
  // regression watchdogs asserting `null`; flipped to positive assertions
  // now that the dictionary covers CJK.
  it("Chinese (Simplified): 验证码 with 6-digit code", () => {
    const r = extractOtp("验证码: 772910");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("772910");
    expect(r!.confidence).toBeGreaterThan(0);
  });

  it("Chinese (Traditional): 驗證碼 with 6-digit code", () => {
    // IMP-1 [B-3]: new case for Traditional Chinese.
    const r = extractOtp("驗證碼: 614728 請於 10 分鐘內輸入");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("614728");
    expect(r!.confidence).toBeGreaterThan(0);
  });

  it("Japanese: 確認コード with 6-digit code", () => {
    const r = extractOtp("確認コード: 123456");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("123456");
    expect(r!.confidence).toBeGreaterThan(0);
  });

  it("Japanese: 認証番号 with 6-digit code", () => {
    // IMP-1 [B-3]: new case for Japanese 認証番号 variant.
    const r = extractOtp("認証番号は 839201 です。");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("839201");
    expect(r!.confidence).toBeGreaterThan(0);
  });

  it("Japanese: 確認コード embedded in sentence", () => {
    const r = extractOtp("確認コード 612385 を入力してください");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("612385");
  });

  it("Mixed: latin 'verification code' wins regardless of script", () => {
    const r = extractOtp("English: Your verification code is 992847.");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("992847");
  });
});

// ─────────────────────────────────────────────────────────
// REGRESSION: HIGH-2 — 8-digit date false positive
// ─────────────────────────────────────────────────────────
describe("extractOtp — REGRESSION HIGH-2 (date false-positive)", () => {
  it("does NOT return 20240331 for 'Order date 20240331. Your verification code is 123456.'", () => {
    const r = extractOtp(
      "Order date 20240331. Your verification code is 123456.",
    );
    expect(r).not.toBeNull();
    expect(r!.code).toBe("123456");
    expect(r!.code).not.toBe("20240331");
    expect(r!.confidence).toBeGreaterThan(0);
  });

  it("never returns 20240331 for 'Order #20240331 verification code: 4829'", () => {
    const r = extractOtp("Order #20240331 verification code: 4829");
    // r may be null (4829 might score below threshold near 'order') or "4829".
    // What MUST NEVER happen: returning the date.
    if (r !== null) {
      expect(r.code).not.toBe("20240331");
      expect(r.code).toBe("4829");
    }
  });

  it("recovers 482913 for 'Today is 2024-03-31 and your code 482913 is valid' (IMP-2 strict)", () => {
    // IMP-2 [B-1]: flipped from soft assert to strict after adding
    // standalone `\bcode\b` to the positive dictionary. The date guard
    // must still kill 20240331; bare "code" now boosts 482913 above
    // threshold on its own.
    const r = extractOtp(
      "Today is 2024-03-31 and your code 482913 is valid",
    );
    expect(r).not.toBeNull();
    expect(r!.code).toBe("482913");
    expect(r!.code).not.toBe("20240331");
    expect(r!.confidence).toBeGreaterThan(0);
  });

  it("IMP-2 negative regression: 'your code 20240331' never surfaces the date", () => {
    // Date guard MUST still win even when bare "code" is in range.
    const r = extractOtp("your code 20240331");
    if (r !== null) {
      expect(r.code).not.toBe("20240331");
      expect(r.code.length).not.toBe(8);
    }
  });

  it("IMP-2: 'Please enter your code: 847291 to continue' recovers 847291", () => {
    const r = extractOtp("Please enter your code: 847291 to continue");
    expect(r).not.toBeNull();
    expect(r!.code).toBe("847291");
  });

  it("rejects bare 8-digit date '19991231' in isolation (no keyword)", () => {
    // Year + date guard: 19991231 must never be classified as OTP. With
    // no keyword present, even a 4-digit fallback ('1999') is killed by
    // the year guard.
    const r = extractOtp("19991231");
    expect(r).toBeNull();
  });

  it("date guard kills the 8-digit candidate even with a strong keyword", () => {
    // The 8-digit `20240331` itself must never be returned. (A 4-digit
    // sub-token like `0331` may still be picked up — that's a separate
    // concern tracked in B-1.)
    const r = extractOtp("verification code 20240331");
    if (r !== null) {
      expect(r.code).not.toBe("20240331");
      expect(r.code.length).not.toBe(8);
    }
  });

  it("rejects 6-digit YYYYMM (e.g. '202403') as date-shaped", () => {
    // Pattern '202403' matches the 6-digit YYYYMM guard added in FIX-1.
    // Window has `verification code` so the 6-digit candidate gets a high
    // score, but the date guard rejects it before scoring runs.
    const r = extractOtp("verification code 202403");
    if (r !== null) {
      expect(r.code).not.toBe("202403");
    }
  });
});
