import { describe, it, expect } from "vitest";
import {
  hmacSha256,
  hmacSha256Hex,
  hmacSha256Verify,
  bufToHex,
  constantTimeEqual,
} from "../../src/lib/hash.js";

/**
 * Low-level HMAC / hex / constant-time equality tests.
 *
 * The jwt.test.ts suite already exercises sign/verify round-trips which
 * use these functions internally. This suite tests the functions directly
 * for coverage and edge cases (empty strings, different-length inputs).
 */

const SECRET = "test-secret";

describe("bufToHex", () => {
  it("converts an empty ArrayBuffer to empty string", () => {
    expect(bufToHex(new ArrayBuffer(0))).toBe("");
  });

  it("converts known bytes to hex", () => {
    const buf = new Uint8Array([0x00, 0xff, 0x0a, 0xab]).buffer;
    expect(bufToHex(buf)).toBe("00ff0aab");
  });
});

describe("constantTimeEqual", () => {
  it("returns true for identical strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(constantTimeEqual("abc", "ab")).toBe(false);
  });

  it("returns true for empty strings", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("returns false for empty vs non-empty", () => {
    expect(constantTimeEqual("", "x")).toBe(false);
  });
});

describe("hmacSha256", () => {
  it("returns an ArrayBuffer", async () => {
    const result = await hmacSha256(SECRET, "message");
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBe(32); // SHA-256 = 32 bytes
  });

  it("is deterministic for the same inputs", async () => {
    const a = await hmacSha256(SECRET, "hello");
    const b = await hmacSha256(SECRET, "hello");
    expect(bufToHex(a)).toBe(bufToHex(b));
  });

  it("produces different output for different messages", async () => {
    const a = await hmacSha256(SECRET, "hello");
    const b = await hmacSha256(SECRET, "world");
    expect(bufToHex(a)).not.toBe(bufToHex(b));
  });

  it("produces different output for different secrets", async () => {
    const a = await hmacSha256("secret-a", "msg");
    const b = await hmacSha256("secret-b", "msg");
    expect(bufToHex(a)).not.toBe(bufToHex(b));
  });

  it("handles empty message", async () => {
    const result = await hmacSha256(SECRET, "");
    expect(result.byteLength).toBe(32);
  });
});

describe("hmacSha256Hex", () => {
  it("returns a 64-char hex string", async () => {
    const hex = await hmacSha256Hex(SECRET, "message");
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hmacSha256Verify", () => {
  it("returns true for correct signature", async () => {
    const hex = await hmacSha256Hex(SECRET, "message");
    const ok = await hmacSha256Verify(SECRET, "message", hex);
    expect(ok).toBe(true);
  });

  it("returns false for tampered message", async () => {
    const hex = await hmacSha256Hex(SECRET, "message");
    const ok = await hmacSha256Verify(SECRET, "tampered", hex);
    expect(ok).toBe(false);
  });

  it("returns false for wrong secret", async () => {
    const hex = await hmacSha256Hex(SECRET, "message");
    const ok = await hmacSha256Verify("wrong-secret", "message", hex);
    expect(ok).toBe(false);
  });

  it("returns false for corrupt hex", async () => {
    const ok = await hmacSha256Verify(SECRET, "message", "0".repeat(64));
    expect(ok).toBe(false);
  });
});
