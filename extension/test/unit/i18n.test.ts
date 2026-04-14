/**
 * Unit tests for popup/i18n — locale resolution and message retrieval.
 */
import { describe, it, expect } from "vitest";
import { resolveLocale, getMessages, type Locale } from "../../src/popup/i18n/index";
import { ko } from "../../src/popup/i18n/ko";
import { en } from "../../src/popup/i18n/en";

describe("resolveLocale()", () => {
  it("returns a valid locale string", () => {
    const locale = resolveLocale();
    expect(["ko", "en"]).toContain(locale);
  });
});

describe("getMessages()", () => {
  it("returns ko messages for ko locale", () => {
    const messages = getMessages("ko");
    expect(messages.appTitle).toBe(ko.appTitle);
    expect(messages.header.settings).toBe(ko.header.settings);
  });

  it("returns en messages for en locale", () => {
    const messages = getMessages("en");
    expect(messages.appTitle).toBe(en.appTitle);
    expect(messages.header.settings).toBe(en.header.settings);
  });

  it("ko messages have all required keys", () => {
    const t = getMessages("ko");
    expect(t.appTitle).toBeTruthy();
    expect(t.header.settings).toBeTruthy();
    expect(t.header.back).toBeTruthy();
    expect(t.main.copy).toBeTruthy();
    expect(t.main.emptyState).toBeTruthy();
    expect(t.onboarding.step1Title).toBeTruthy();
    expect(t.managed.title).toBeTruthy();
    expect(t.settings.title).toBeTruthy();
    expect(t.errors.rate_limited).toBeTruthy();
    expect(t.privacy.footer).toBeTruthy();
  });

  it("en messages have all required keys", () => {
    const t = getMessages("en");
    expect(t.appTitle).toBeTruthy();
    expect(t.header.settings).toBeTruthy();
    expect(t.main.copy).toBeTruthy();
    expect(t.onboarding.step1Title).toBeTruthy();
    expect(t.managed.title).toBeTruthy();
    expect(t.settings.title).toBeTruthy();
    expect(t.errors.rate_limited).toBeTruthy();
    expect(t.privacy.footer).toBeTruthy();
  });

  it("ttlRemaining function formats correctly", () => {
    const t = getMessages("ko");
    const result = t.main.ttlRemaining("05:30");
    expect(result).toContain("05:30");
  });

  it("lastMail function formats correctly", () => {
    const t = getMessages("ko");
    const result = t.managed.lastMail("5분 전");
    expect(result).toContain("5분 전");
  });
});
