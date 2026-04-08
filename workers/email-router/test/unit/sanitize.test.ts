import { describe, it, expect } from "vitest";
import { sanitizeDoPayload } from "../../src/lib/sanitize.js";

/**
 * sanitizeDoPayload — privacy whitelist enforcement.
 *
 * This is the LAST line of defence against accidental persistence of raw
 * email body / headers / sender into Durable Object storage. The test set
 * here is the executable spec for the privacy invariant.
 *
 * Behaviour (read from src/lib/sanitize.ts):
 *   - throws if a forbidden key is present
 *   - silently strips any key that's neither allowed nor forbidden
 *   - requires receivedAt:number
 *   - validates types of optional fields
 */

const FORBIDDEN_KEYS = [
  "raw",
  "html",
  "text",
  "from",
  "subject",
  "to",
  "headers",
  "messageId",
  "rawEmail",
  "body",
] as const;

describe("sanitizeDoPayload — happy path", () => {
  it("passes a minimal valid payload through", () => {
    const out = sanitizeDoPayload({ receivedAt: 1712563200 });
    expect(out).toEqual({ receivedAt: 1712563200 });
  });

  it("passes a full valid payload through", () => {
    const out = sanitizeDoPayload({
      otp: "482913",
      confidence: 0.85,
      verifyLinks: ["https://example.com/verify"],
      receivedAt: 1712563200,
    });
    expect(out).toEqual({
      otp: "482913",
      confidence: 0.85,
      verifyLinks: ["https://example.com/verify"],
      receivedAt: 1712563200,
    });
  });

  it("silently strips unknown non-forbidden keys", () => {
    const out = sanitizeDoPayload({
      receivedAt: 1,
      evil: "anything",
      sneaky: { nested: 1 },
    } as Record<string, unknown>);
    expect(out).toEqual({ receivedAt: 1 });
    // ensure stripped keys did not survive
    expect((out as Record<string, unknown>).evil).toBeUndefined();
    expect((out as Record<string, unknown>).sneaky).toBeUndefined();
  });
});

describe("sanitizeDoPayload — forbidden keys", () => {
  it("throws on the canonical R-PRIVACY-1 input (raw key present)", () => {
    expect(() =>
      sanitizeDoPayload({
        otp: "123",
        confidence: 0.5,
        verifyLinks: [],
        receivedAt: 1,
        raw: "FORBIDDEN",
      }),
    ).toThrowError(/raw/);
  });

  for (const key of FORBIDDEN_KEYS) {
    it(`throws when forbidden key "${key}" is present`, () => {
      const payload: Record<string, unknown> = {
        receivedAt: 1,
        [key]: "leak",
      };
      expect(() => sanitizeDoPayload(payload)).toThrowError(
        new RegExp(`forbidden key "${key}"`),
      );
    });
  }
});

describe("sanitizeDoPayload — invalid types", () => {
  it("throws when input is null", () => {
    expect(() => sanitizeDoPayload(null)).toThrowError(/object/);
  });

  it("throws when input is a primitive", () => {
    expect(() => sanitizeDoPayload("hello")).toThrowError(/object/);
    expect(() => sanitizeDoPayload(42)).toThrowError(/object/);
  });

  it("throws when receivedAt is missing", () => {
    expect(() => sanitizeDoPayload({})).toThrowError(/receivedAt/);
  });

  it("throws when receivedAt is not a number", () => {
    expect(() => sanitizeDoPayload({ receivedAt: "later" })).toThrowError(
      /receivedAt/,
    );
  });

  it("throws when otp is non-string", () => {
    expect(() =>
      sanitizeDoPayload({ receivedAt: 1, otp: 123 }),
    ).toThrowError(/otp/);
  });

  it("throws when confidence is non-number", () => {
    expect(() =>
      sanitizeDoPayload({ receivedAt: 1, confidence: "high" }),
    ).toThrowError(/confidence/);
  });

  it("throws when verifyLinks is not an array", () => {
    expect(() =>
      sanitizeDoPayload({ receivedAt: 1, verifyLinks: "https://x.example" }),
    ).toThrowError(/verifyLinks/);
  });

  it("throws when verifyLinks contains non-strings", () => {
    expect(() =>
      sanitizeDoPayload({
        receivedAt: 1,
        verifyLinks: ["https://ok.example", 123],
      }),
    ).toThrowError(/verifyLinks/);
  });
});
