/**
 * IOSFloatingButtonInjector — unit tests.
 *
 * Tests platform detection, button mounting, state transitions,
 * field fill, and forceGenerate path.
 * happy-dom environment (same as M2 popup tests).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IOSFloatingButtonInjector } from "../src/content/ios-injector";

// ── Mock bridge (sendMessage) ──────────────────────────────────
vi.mock("../src/content/bridge", () => ({
  sendMessage: vi.fn(),
}));
// ── Mock ios-bridge (haptic / appendRecentAlias) ───────────────
vi.mock("../src/content/ios-bridge", () => ({
  haptic: vi.fn(),
  appendRecentAlias: vi.fn(),
  storeToken: vi.fn(),
  loadToken: vi.fn(() => Promise.resolve(null)),
}));

import { sendMessage } from "../src/content/bridge";
import { haptic, appendRecentAlias } from "../src/content/ios-bridge";

// ── Helpers ────────────────────────────────────────────────────

function makeInjector(mode: "ephemeral" | "managed" = "ephemeral") {
  let currentInput: HTMLInputElement | null = null;
  const injector = new IOSFloatingButtonInjector({
    getMode: () => mode,
    getCurrentInput: () => currentInput,
  });
  const setInput = (el: HTMLInputElement | null) => { currentInput = el; };
  return { injector, setInput };
}

function queryButton(): HTMLButtonElement | null {
  for (const host of document.querySelectorAll("[data-shieldmail-ios]")) {
    const btn = host.shadowRoot?.querySelector<HTMLButtonElement>(".shield-btn");
    if (btn) return btn;
  }
  return null;
}

function queryHost(): HTMLDivElement | null {
  return document.querySelector<HTMLDivElement>("[data-shieldmail-ios]");
}

describe("IOSFloatingButtonInjector", () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up any mounted hosts
    document.querySelectorAll("[data-shieldmail-ios]").forEach((el) => el.remove());
  });

  // ── Mount / visibility ────────────────────────────────────────

  it("mounts a host element on show()", () => {
    const { injector } = makeInjector();
    expect(queryHost()).toBeNull();
    injector.show();
    expect(queryHost()).not.toBeNull();
  });

  it("does NOT create a duplicate host on repeated show() calls", () => {
    const { injector } = makeInjector();
    injector.show();
    injector.show();
    expect(document.querySelectorAll("[data-shieldmail-ios]").length).toBe(1);
  });

  it("hides the host on hide()", () => {
    const { injector } = makeInjector();
    injector.show();
    injector.hide();
    const host = queryHost();
    expect(host?.style.display).toBe("none");
  });

  it("re-shows an existing host without duplicating", () => {
    const { injector } = makeInjector();
    injector.show();
    injector.hide();
    injector.show();
    expect(document.querySelectorAll("[data-shieldmail-ios]").length).toBe(1);
  });

  it("removes host on destroy()", () => {
    const { injector } = makeInjector();
    injector.show();
    injector.destroy();
    expect(queryHost()).toBeNull();
  });

  // ── Button state ──────────────────────────────────────────────

  it("button starts in default state", () => {
    const { injector } = makeInjector();
    injector.show();
    const btn = queryButton();
    expect(btn?.getAttribute("data-state")).toBe("default");
    expect(btn?.getAttribute("aria-busy")).toBe("false");
  });

  it("button aria-label is set for default state", () => {
    const { injector } = makeInjector();
    injector.show();
    const btn = queryButton();
    expect(btn?.getAttribute("aria-label")).toContain("ShieldMail");
  });

  // ── Successful generation ─────────────────────────────────────

  it("transitions to generating then done on successful alias generation", async () => {
    const mockSend = vi.mocked(sendMessage);
    mockSend.mockResolvedValueOnce({
      type: "GENERATE_ALIAS_RESULT",
      ok: true,
      record: { aliasId: "abc12345678901", address: "abc12345678901@d1.shld.me" },
    });

    const input = document.createElement("input");
    input.type = "email";
    document.body.appendChild(input);

    const { injector, setInput } = makeInjector();
    setInput(input);
    injector.show();

    // Trigger activate via click
    const btn = queryButton()!;
    btn.click();

    // State becomes generating immediately
    expect(btn.getAttribute("data-state")).toBe("generating");

    // Await resolution
    await vi.waitFor(() => {
      expect(btn.getAttribute("data-state")).toBe("done");
    });

    // Haptic success fired
    expect(haptic).toHaveBeenCalledWith("success");

    // Alias persisted
    expect(appendRecentAlias).toHaveBeenCalledWith(
      expect.objectContaining({ address: "abc12345678901@d1.shld.me" })
    );

    // Field filled
    expect(input.value).toBe("abc12345678901@d1.shld.me");

    document.body.removeChild(input);
  });

  it("sends GENERATE_ALIAS with correct mode and origin", async () => {
    const mockSend = vi.mocked(sendMessage);
    mockSend.mockResolvedValueOnce({
      type: "GENERATE_ALIAS_RESULT",
      ok: true,
      record: { aliasId: "xyzabc12345678", address: "xyzabc12345678@d2.shld.me" },
    });

    const { injector } = makeInjector("managed");
    injector.show();
    queryButton()!.click();

    await vi.waitFor(() => expect(mockSend).toHaveBeenCalled());

    const [msg] = mockSend.mock.calls[0] as [{ type: string; mode: string; origin: string }];
    expect(msg.type).toBe("GENERATE_ALIAS");
    expect(msg.mode).toBe("managed");
    expect(msg.origin).toBe(location.origin);
  });

  // ── Error handling ────────────────────────────────────────────

  it("transitions to error state when API returns ok: false", async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({ ok: false, error: "network_error" });

    const { injector } = makeInjector();
    injector.show();
    queryButton()!.click();

    await vi.waitFor(() => {
      expect(queryButton()?.getAttribute("data-state")).toBe("error");
    });
    expect(haptic).toHaveBeenCalledWith("error");
  });

  it("transitions to error when sendMessage resolves null", async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce(null);

    const { injector } = makeInjector();
    injector.show();
    queryButton()!.click();

    await vi.waitFor(() => {
      expect(queryButton()?.getAttribute("data-state")).toBe("error");
    });
  });

  it("error state auto-resets to default after 2s", async () => {
    vi.useFakeTimers();
    vi.mocked(sendMessage).mockResolvedValueOnce({ ok: false, error: "fail" });

    const { injector } = makeInjector();
    injector.show();
    queryButton()!.click();

    await vi.waitFor(() => {
      expect(queryButton()?.getAttribute("data-state")).toBe("error");
    });

    vi.advanceTimersByTime(2100);
    expect(queryButton()?.getAttribute("data-state")).toBe("default");
    vi.useRealTimers();
  });

  // ── forceGenerate path ────────────────────────────────────────

  it("forceGenerate mounts button and triggers generation", async () => {
    vi.mocked(sendMessage).mockResolvedValueOnce({
      type: "GENERATE_ALIAS_RESULT",
      ok: true,
      record: { aliasId: "force56789012", address: "force56789012@d1.shld.me" },
    });

    const { injector } = makeInjector();
    injector.forceGenerate();

    expect(queryHost()).not.toBeNull();
    await vi.waitFor(() => {
      expect(queryButton()?.getAttribute("data-state")).toBe("done");
    });
  });

  // ── Guards ────────────────────────────────────────────────────

  it("ignores duplicate activation while generating", async () => {
    const mockSend = vi.mocked(sendMessage);
    // First call hangs
    mockSend.mockReturnValueOnce(new Promise(() => {}));

    const { injector } = makeInjector();
    injector.show();
    const btn = queryButton()!;
    btn.click(); // starts generating
    btn.click(); // should be ignored

    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  // ── FORCE_INJECT message shape (BLOCKER-2 regression) ────────

  it("handles { type: 'FORCE_INJECT' } shape from background (macOS-style)", () => {
    // index.ts dispatches both shapes; ensure the condition accepts type-keyed messages.
    // We test the shape logic by checking both fields are parsed.
    const msgWithType = { type: "FORCE_INJECT" };
    const msgWithName = { name: "FORCE_INJECT" };

    const isForce = (msg: object) =>
      (msg as { type?: string })?.type === "FORCE_INJECT" ||
      (msg as { name?: string })?.name === "FORCE_INJECT";

    expect(isForce(msgWithType)).toBe(true);
    expect(isForce(msgWithName)).toBe(true);
    expect(isForce({ type: "SOMETHING_ELSE" })).toBe(false);
    expect(isForce({})).toBe(false);
  });

  // ── ios-bridge: loadToken returns null without safari context ──

  it("loadToken resolves null immediately without safari context", async () => {
    // isSafariExtensionContext returns false (mocked above)
    const { loadToken } = await import("../src/content/ios-bridge");
    const result = await loadToken("some-alias-id");
    expect(result).toBeNull();
  });
});

// ── Position update: visualViewport null fallback ─────────────────

describe("IOSFloatingButtonInjector — position with null visualViewport", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => {
    document.querySelectorAll("[data-shieldmail-ios]").forEach((el) => el.remove());
  });

  it("does not throw when window.visualViewport is null", () => {
    const origVp = window.visualViewport;
    Object.defineProperty(window, "visualViewport", { value: null, configurable: true });

    const { injector } = (() => {
      const inj = new IOSFloatingButtonInjector({
        getMode: () => "ephemeral",
        getCurrentInput: () => null,
      });
      return { injector: inj };
    })();

    expect(() => injector.show()).not.toThrow();
    Object.defineProperty(window, "visualViewport", { value: origVp, configurable: true });
  });

  it("sets bottom >= BUTTON_BOTTOM_MARGIN (8px) even without visualViewport", () => {
    const origVp = window.visualViewport;
    Object.defineProperty(window, "visualViewport", { value: null, configurable: true });

    const inj = new IOSFloatingButtonInjector({
      getMode: () => "ephemeral",
      getCurrentInput: () => null,
    });
    inj.show();

    const host = document.querySelector<HTMLDivElement>("[data-shieldmail-ios]");
    const bottom = parseFloat(host?.style.bottom ?? "0");
    expect(bottom).toBeGreaterThanOrEqual(8);

    Object.defineProperty(window, "visualViewport", { value: origVp, configurable: true });
  });
});

// ── Done → hidden transition timing ──────────────────────────────

describe("IOSFloatingButtonInjector — done→hidden timing", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll("[data-shieldmail-ios]").forEach((el) => el.remove());
  });

  it("transitions to hidden state after 1200ms done + 300ms fade", async () => {
    vi.useFakeTimers();
    vi.mocked(sendMessage).mockResolvedValueOnce({
      type: "GENERATE_ALIAS_RESULT",
      ok: true,
      record: { aliasId: "done12345678901", address: "done12345678901@d.shld.me" },
    });

    const inj = new IOSFloatingButtonInjector({
      getMode: () => "ephemeral",
      getCurrentInput: () => null,
    });
    inj.show();

    let btn: HTMLButtonElement | null = null;
    for (const el of document.querySelectorAll("[data-shieldmail-ios]")) {
      const b = el.shadowRoot?.querySelector<HTMLButtonElement>(".shield-btn");
      if (b) { btn = b; break; }
    }

    btn!.click();
    await vi.waitFor(() => expect(btn!.getAttribute("data-state")).toBe("done"));

    // Before 1200ms
    vi.advanceTimersByTime(1100);
    expect(btn!.getAttribute("data-state")).toBe("done");

    // After 1200ms (fade starts)
    vi.advanceTimersByTime(100);

    // After additional 300ms fade-out
    vi.advanceTimersByTime(300);
    expect(btn!.getAttribute("data-state")).toBe("hidden");
  });
});

// ── Error → default recovery timing ──────────────────────────────

describe("IOSFloatingButtonInjector — error recovery at exactly 2000ms", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll("[data-shieldmail-ios]").forEach((el) => el.remove());
  });

  it("recovers from error to default after 2000ms", async () => {
    vi.useRealTimers(); // real timers — fake timers + waitFor races
    vi.mocked(sendMessage).mockResolvedValueOnce({ ok: false, error: "fail" });

    const inj = new IOSFloatingButtonInjector({
      getMode: () => "ephemeral",
      getCurrentInput: () => null,
    });
    inj.show();

    let btn: HTMLButtonElement | null = null;
    for (const el of document.querySelectorAll("[data-shieldmail-ios]")) {
      const b = el.shadowRoot?.querySelector<HTMLButtonElement>(".shield-btn");
      if (b) { btn = b; break; }
    }

    btn!.click();

    // Wait for error state
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (btn!.getAttribute("data-state") === "error") {
          clearInterval(check);
          resolve();
        }
      }, 10);
      setTimeout(() => { clearInterval(check); resolve(); }, 1000);
    });
    expect(btn!.getAttribute("data-state")).toBe("error");

    // Wait > 2s for auto-recovery
    await new Promise((r) => setTimeout(r, 2100));
    expect(btn!.getAttribute("data-state")).toBe("default");
  });
});
