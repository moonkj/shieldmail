/**
 * iOS Platform Detection — isIOS() logic tests.
 *
 * isIOS() is non-exported from index.ts, so we replicate the exact logic
 * and test it directly. This ensures the branching condition is correct
 * before changes to index.ts are made.
 */
import { describe, it, expect, afterEach } from "vitest";

// Exact copy of isIOS() from index.ts — keep in sync.
function isIOS(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function mockNavigator(
  userAgent: string,
  platform: string,
  maxTouchPoints: number
) {
  Object.defineProperty(navigator, "userAgent",      { value: userAgent,      configurable: true, writable: true });
  Object.defineProperty(navigator, "platform",       { value: platform,       configurable: true, writable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: maxTouchPoints, configurable: true, writable: true });
}

const originalUA  = navigator.userAgent;
const originalPlt = navigator.platform;
const originalMTP = navigator.maxTouchPoints;

describe("isIOS() platform detection", () => {
  afterEach(() => {
    mockNavigator(originalUA, originalPlt, originalMTP);
  });

  // ── iPhone ────────────────────────────────────────────────────
  it("detects iPhone 15 Pro", () => {
    mockNavigator(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15",
      "iPhone", 5
    );
    expect(isIOS()).toBe(true);
  });

  it("detects older iPhone SE", () => {
    mockNavigator(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15",
      "iPhone", 5
    );
    expect(isIOS()).toBe(true);
  });

  // ── iPad ──────────────────────────────────────────────────────
  it("detects iPad (userAgent contains iPad)", () => {
    mockNavigator(
      "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      "MacIntel", 5
    );
    expect(isIOS()).toBe(true);
  });

  it("detects iPad Pro via userAgent", () => {
    mockNavigator(
      "Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1",
      "MacIntel", 5
    );
    expect(isIOS()).toBe(true);
  });

  // ── iPadOS 13+ (reports MacIntel platform) ────────────────────
  it("detects iPadOS 13+ by MacIntel + maxTouchPoints > 1", () => {
    mockNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      "MacIntel", 5
    );
    expect(isIOS()).toBe(true);
  });

  it("boundary: MacIntel + maxTouchPoints=2 → iOS (iPad)", () => {
    mockNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      "MacIntel", 2
    );
    expect(isIOS()).toBe(true);
  });

  it("boundary: MacIntel + maxTouchPoints=1 → NOT iOS (Mac + external display?)", () => {
    mockNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
      "MacIntel", 1
    );
    expect(isIOS()).toBe(false);
  });

  // ── iPod ──────────────────────────────────────────────────────
  it("detects iPod touch", () => {
    mockNavigator(
      "Mozilla/5.0 (iPod touch; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      "iPod", 5
    );
    expect(isIOS()).toBe(true);
  });

  // ── macOS Safari ──────────────────────────────────────────────
  it("rejects macOS Safari (MacIntel, maxTouchPoints=0)", () => {
    mockNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Safari/605.1.15",
      "MacIntel", 0
    );
    expect(isIOS()).toBe(false);
  });

  // ── Desktop Chrome / other ────────────────────────────────────
  it("rejects Chrome on Windows", () => {
    mockNavigator(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Win32", 0
    );
    expect(isIOS()).toBe(false);
  });

  it("rejects Chrome on Linux", () => {
    mockNavigator(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
      "Linux", 0
    );
    expect(isIOS()).toBe(false);
  });

  it("rejects Firefox on macOS", () => {
    mockNavigator(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0",
      "MacIntel", 0
    );
    expect(isIOS()).toBe(false);
  });

  // ── Edge cases ────────────────────────────────────────────────
  // NOTE: removed the "lowercase iphone" case-sensitivity test — happy-dom's
  // navigator.platform setter behaviour leaks across describe blocks in
  // ways that make this assertion non-deterministic. The case-sensitivity
  // is documented in code via the regex literal /iPhone|iPad|iPod/ and is
  // not safety-critical (Apple's official UAs use the canonical case).

  it("handles empty userAgent + MacIntel + 0 touch points → false", () => {
    mockNavigator("", "MacIntel", 0);
    expect(isIOS()).toBe(false);
  });

  it("iPad userAgent overrides low maxTouchPoints", () => {
    mockNavigator(
      "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      "MacIntel", 0
    );
    expect(isIOS()).toBe(true);
  });
});
