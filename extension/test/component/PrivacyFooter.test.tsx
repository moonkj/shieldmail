/**
 * Component tests for PrivacyFooter — always-visible string + countdown.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { PrivacyFooter } from "../../src/popup/components/PrivacyFooter";
import { renderComponent, flush } from "./_render";
import { getMessages } from "../../src/popup/i18n/index";

const t = getMessages();

afterEach(() => {
  vi.useRealTimers();
});

describe("PrivacyFooter", () => {
  it("always renders the privacy footer string", () => {
    const { container } = renderComponent(PrivacyFooter, {});
    expect(container.textContent).toContain(t.privacy.footer);
  });

  it("renders footer string even when expiresAt is null", () => {
    const { container } = renderComponent(PrivacyFooter, { expiresAt: null });
    expect(container.textContent).toContain(t.privacy.footer);
    expect(container.querySelector(".ttl")).toBeNull();
  });

  it("renders a TTL countdown span when expiresAt is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 min
    const { container } = renderComponent(PrivacyFooter, { expiresAt });
    expect(container.querySelector(".ttl")?.textContent).toContain("10:00");
  });

  it("TTL countdown updates on interval tick", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T00:00:00Z"));
    const expiresAt = Date.now() + 60 * 1000; // 1 min
    const { container } = renderComponent(PrivacyFooter, { expiresAt });
    expect(container.querySelector(".ttl")?.textContent).toContain("01:00");
    vi.advanceTimersByTime(1_000);
    await flush();
    expect(container.querySelector(".ttl")?.textContent).toContain("00:59");
  });
});
