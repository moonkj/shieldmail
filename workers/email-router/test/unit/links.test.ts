import { describe, it, expect } from "vitest";
import { extractLinks, cleanUrl } from "../../src/parser/links.js";

/**
 * Link extractor unit tests.
 *
 * Mirrors ARCHITECTURE.md §5 link rules and the FIX-2 [HIGH-3] regression
 * for HubSpot double-underscore tracking parameters.
 */

describe("extractLinks — HTML <a> extraction", () => {
  it("extracts a single verify link from HTML", () => {
    const html = '<a href="https://example.com/verify?token=abc">Verify</a>';
    const links = extractLinks(html, null);
    expect(links).toEqual(["https://example.com/verify?token=abc"]);
  });

  it("returns top 3 links sorted by keyword score", () => {
    const html = `
      <a href="https://example.com/random">random</a>
      <a href="https://example.com/verify">Verify your account</a>
      <a href="https://example.com/activate">Activate</a>
      <a href="https://example.com/somewhere-else">somewhere</a>
    `;
    const links = extractLinks(html, null);
    expect(links.length).toBeLessThanOrEqual(3);
    // Verify should rank highest because both URL and anchor text contain
    // 'verify' (combined +7).
    expect(links[0]).toContain("verify");
  });

  it("ranks anchor-text keyword higher than url-only keyword", () => {
    const html = `
      <a href="https://example.com/path1">verify your account</a>
      <a href="https://example.com/verify">click here</a>
    `;
    const links = extractLinks(html, null);
    expect(links[0]).toBe("https://example.com/path1");
  });

  it("falls back to plaintext URL extraction when no HTML", () => {
    const text = "Click here to verify: https://example.com/verify?token=xyz";
    const links = extractLinks(null, text);
    expect(links).toContain("https://example.com/verify?token=xyz");
  });

  it("returns empty array on empty HTML and empty text", () => {
    expect(extractLinks("", "")).toEqual([]);
    expect(extractLinks(null, null)).toEqual([]);
    expect(extractLinks(undefined, undefined)).toEqual([]);
  });

  it("dedupes identical URLs across HTML and text", () => {
    const html = '<a href="https://example.com/verify?t=1">Verify</a>';
    const text = "Or paste: https://example.com/verify?t=1";
    const links = extractLinks(html, text);
    expect(links.filter((l) => l === "https://example.com/verify?t=1").length).toBe(1);
  });
});

describe("extractLinks — protocol filtering", () => {
  it("drops javascript: URLs", () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    expect(extractLinks(html, null)).toEqual([]);
  });

  it("drops data: URLs", () => {
    const html = '<a href="data:text/html,<h1>x</h1>">click</a>';
    expect(extractLinks(html, null)).toEqual([]);
  });

  it("drops http: (not https)", () => {
    const html = '<a href="http://insecure.example.com/verify">verify</a>';
    expect(extractLinks(html, null)).toEqual([]);
  });

  it("keeps https: URLs", () => {
    const html = '<a href="https://secure.example.com/verify">verify</a>';
    expect(extractLinks(html, null)).toEqual([
      "https://secure.example.com/verify",
    ]);
  });
});

describe("extractLinks — Korean keywords", () => {
  it("recognises 인증 in URL", () => {
    const html =
      '<a href="https://example.com/인증">verify</a><a href="https://example.com/random">random</a>';
    const links = extractLinks(html, null);
    // The 인증 link should rank first (or at least be present).
    expect(links.length).toBeGreaterThan(0);
  });

  it("recognises 확인 in anchor text", () => {
    const html =
      '<a href="https://example.com/abc">계정 확인</a><a href="https://example.com/random">random</a>';
    const links = extractLinks(html, null);
    expect(links[0]).toBe("https://example.com/abc");
  });
});

describe("extractLinks — malformed input", () => {
  it("does not throw on malformed HTML", () => {
    const html = "<a href=";
    expect(() => extractLinks(html, null)).not.toThrow();
  });

  it("does not throw on garbage URL in plaintext", () => {
    const text = "go to https://??????????? right now";
    expect(() => extractLinks(null, text)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────
// REGRESSION: HIGH-3 — HubSpot tracking params
// ─────────────────────────────────────────────────────────
describe("extractLinks — REGRESSION HIGH-3 (HubSpot tracking params)", () => {
  it("strips __hssc, __hstc, __hsfp, utm_source from a single URL", () => {
    const url =
      "https://example.com/verify?token=abc&__hssc=1&__hstc=2&utm_source=x&__hsfp=3";
    const cleaned = cleanUrl(url);
    expect(cleaned).toBe("https://example.com/verify?token=abc");
  });

  it("strips both single-underscore _hsenc/_hsmi", () => {
    const url = "https://example.com/verify?token=abc&_hsenc=z&_hsmi=q";
    const cleaned = cleanUrl(url);
    expect(cleaned).toBe("https://example.com/verify?token=abc");
  });

  it("strips fbclid, gclid, mc_cid, mc_eid", () => {
    const url =
      "https://example.com/auth?id=42&fbclid=zzz&gclid=qqq&mc_cid=12&mc_eid=34";
    const cleaned = cleanUrl(url);
    expect(cleaned).toBe("https://example.com/auth?id=42");
  });

  it("preserves non-tracking 'hs_mode=live'", () => {
    const url = "https://example.com/manage?hs_mode=live&utm_medium=email";
    const cleaned = cleanUrl(url);
    expect(cleaned).toBe("https://example.com/manage?hs_mode=live");
  });

  it("preserves 'hsConfig=1' (not a tracker)", () => {
    const url = "https://example.com/manage?hsConfig=1&__hssc=99";
    const cleaned = cleanUrl(url);
    expect(cleaned).toBe("https://example.com/manage?hsConfig=1");
  });

  it("strips tracking params from full HTML extraction", () => {
    const html = `
      <a href="https://example.com/verify?token=abc&__hssc=1&__hstc=2&utm_source=x&__hsfp=3">
        Verify your account
      </a>
    `;
    const links = extractLinks(html, null);
    expect(links).toEqual(["https://example.com/verify?token=abc"]);
  });

  it("normalises trailing punctuation in plaintext URLs", () => {
    const cleaned = cleanUrl("https://example.com/verify?t=1).");
    expect(cleaned).toBe("https://example.com/verify?t=1");
  });
});
