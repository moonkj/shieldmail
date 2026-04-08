/**
 * ios-bridge.ts — unit tests.
 *
 * Covers: isSafariExtensionContext, haptic, storeToken,
 *         appendRecentAlias, loadToken (timeout + resolution).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// We import after setting up mocks so module is fresh per describe.
// happy-dom environment; chrome is mocked in test/setup.ts.

function stubSafari(dispatchImpl?: (...args: unknown[]) => void): void {
  (globalThis as Record<string, unknown>).safari = {
    extension: {
      dispatchMessage: dispatchImpl ?? vi.fn(),
    },
  };
}

function clearSafari(): void {
  delete (globalThis as Record<string, unknown>).safari;
}

// Module under test — imported dynamically so stubbing takes effect.
async function getBridge() {
  // Vite / vitest caches modules; use vi.resetModules() before each suite
  // if state leaks. For this file we avoid module-level side effects.
  return import("../src/content/ios-bridge");
}

describe("isSafariExtensionContext()", () => {
  afterEach(() => clearSafari());

  it("returns false when safari global is absent", async () => {
    const { isSafariExtensionContext } = await getBridge();
    expect(isSafariExtensionContext()).toBe(false);
  });

  it("returns false when safari.extension is missing", async () => {
    (globalThis as Record<string, unknown>).safari = {};
    const { isSafariExtensionContext } = await getBridge();
    expect(isSafariExtensionContext()).toBe(false);
  });

  it("returns true when safari.extension is present", async () => {
    stubSafari();
    const { isSafariExtensionContext } = await getBridge();
    expect(isSafariExtensionContext()).toBe(true);
  });
});

describe("haptic()", () => {
  afterEach(() => clearSafari());

  it("does nothing when no safari context", async () => {
    const { haptic } = await getBridge();
    expect(() => haptic("success")).not.toThrow();
  });

  it.each(["light", "medium", "heavy", "success", "error", "warning", "selection"] as const)(
    "dispatches haptic style '%s' when context available",
    async (style) => {
      const dispatch = vi.fn();
      stubSafari(dispatch);
      const { haptic } = await getBridge();
      haptic(style);
      expect(dispatch).toHaveBeenCalledWith("haptic", { style });
    }
  );

  it("silently swallows exceptions from dispatchMessage", async () => {
    stubSafari(() => { throw new Error("native crash"); });
    const { haptic } = await getBridge();
    expect(() => haptic("medium")).not.toThrow();
  });
});

describe("storeToken()", () => {
  afterEach(() => clearSafari());

  it("is a no-op without safari context", async () => {
    const { storeToken } = await getBridge();
    expect(() => storeToken("id", "tok")).not.toThrow();
  });

  it("dispatches 'storeToken' with correct aliasId and token", async () => {
    const dispatch = vi.fn();
    stubSafari(dispatch);
    const { storeToken } = await getBridge();
    storeToken("alias-abc", "jwt.tok.en");
    expect(dispatch).toHaveBeenCalledWith("storeToken", {
      aliasId: "alias-abc",
      token: "jwt.tok.en",
    });
  });

  it("silently swallows dispatch errors", async () => {
    stubSafari(() => { throw new Error("keychain fail"); });
    const { storeToken } = await getBridge();
    expect(() => storeToken("id", "tok")).not.toThrow();
  });
});

describe("appendRecentAlias()", () => {
  afterEach(() => clearSafari());

  it("is a no-op without safari context", async () => {
    const { appendRecentAlias } = await getBridge();
    expect(() => appendRecentAlias({ aliasId: "a", address: "a@d.me" })).not.toThrow();
  });

  it("dispatches 'storeAliases' with the alias wrapped in an array", async () => {
    const dispatch = vi.fn();
    stubSafari(dispatch);
    const { appendRecentAlias } = await getBridge();
    appendRecentAlias({ aliasId: "abc", address: "abc@d.shld.me" });
    expect(dispatch).toHaveBeenCalledWith("storeAliases", {
      aliases: [{ aliasId: "abc", address: "abc@d.shld.me" }],
    });
  });

  it("includes optional label in the dispatched alias", async () => {
    const dispatch = vi.fn();
    stubSafari(dispatch);
    const { appendRecentAlias } = await getBridge();
    appendRecentAlias({ aliasId: "xyz", address: "xyz@d2.shld.me", label: "GitHub" });
    expect(dispatch).toHaveBeenCalledWith("storeAliases", {
      aliases: [{ aliasId: "xyz", address: "xyz@d2.shld.me", label: "GitHub" }],
    });
  });

  it("aliases payload is always an Array", async () => {
    const dispatch = vi.fn();
    stubSafari(dispatch);
    const { appendRecentAlias } = await getBridge();
    appendRecentAlias({ aliasId: "t", address: "t@d.me" });
    const [, userInfo] = dispatch.mock.calls[0] as [string, { aliases: unknown }];
    expect(Array.isArray(userInfo.aliases)).toBe(true);
  });

  it("silently swallows dispatch errors", async () => {
    stubSafari(() => { throw new Error("storage error"); });
    const { appendRecentAlias } = await getBridge();
    expect(() => appendRecentAlias({ aliasId: "a", address: "a@d.me" })).not.toThrow();
  });
});

describe("loadToken()", () => {
  afterEach(() => {
    clearSafari();
    vi.useRealTimers();
  });

  it("returns null immediately when no safari context", async () => {
    const { loadToken } = await getBridge();
    const result = await loadToken("any-id");
    expect(result).toBeNull();
  });

  it("dispatches getToken to safari extension and resolves null after 3s timeout", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    stubSafari(dispatch);

    const { loadToken } = await getBridge();
    const promise = loadToken("alias-xyz");

    expect(dispatch).toHaveBeenCalledWith("getToken", { aliasId: "alias-xyz" });

    vi.advanceTimersByTime(3100);
    const result = await promise;
    expect(result).toBeNull();
  });

  it("resolves with token when chrome.runtime.onMessage delivers matching message", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    stubSafari(dispatch);

    // Capture the listener registered by loadToken
    let capturedListener: ((msg: unknown) => void) | null = null;
    const originalAdd = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
    vi.spyOn(chrome.runtime.onMessage, "addListener").mockImplementation((fn) => {
      capturedListener = fn as (msg: unknown) => void;
      originalAdd(fn);
    });

    const { loadToken } = await getBridge();
    const promise = loadToken("alias-123");

    vi.advanceTimersByTime(50); // let microtasks settle

    // Simulate Swift → JS response via runtime message
    capturedListener?.({
      name: "tokenResult",
      userInfo: { aliasId: "alias-123", token: "secret-jwt-token" },
    });

    const result = await promise;
    expect(result).toBe("secret-jwt-token");

    vi.restoreAllMocks();
  });

  it("ignores messages with non-matching aliasId", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    stubSafari(dispatch);

    let capturedListener: ((msg: unknown) => void) | null = null;
    vi.spyOn(chrome.runtime.onMessage, "addListener").mockImplementation((fn) => {
      capturedListener = fn as (msg: unknown) => void;
    });

    const { loadToken } = await getBridge();
    const promise = loadToken("alias-A");

    capturedListener?.({
      name: "tokenResult",
      userInfo: { aliasId: "alias-B", token: "wrong" },
    });

    vi.advanceTimersByTime(3100);
    const result = await promise;
    expect(result).toBeNull();

    vi.restoreAllMocks();
  });

  it("ignores messages with wrong name field", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    stubSafari(dispatch);

    let capturedListener: ((msg: unknown) => void) | null = null;
    vi.spyOn(chrome.runtime.onMessage, "addListener").mockImplementation((fn) => {
      capturedListener = fn as (msg: unknown) => void;
    });

    const { loadToken } = await getBridge();
    const promise = loadToken("alias-A");

    capturedListener?.({
      name: "wrongMessage",
      userInfo: { aliasId: "alias-A", token: "tok" },
    });

    vi.advanceTimersByTime(3100);
    const result = await promise;
    expect(result).toBeNull();

    vi.restoreAllMocks();
  });

  it("resolves null when token field is absent in userInfo", async () => {
    vi.useFakeTimers();
    const dispatch = vi.fn();
    stubSafari(dispatch);

    let capturedListener: ((msg: unknown) => void) | null = null;
    vi.spyOn(chrome.runtime.onMessage, "addListener").mockImplementation((fn) => {
      capturedListener = fn as (msg: unknown) => void;
    });

    const { loadToken } = await getBridge();
    const promise = loadToken("alias-A");

    capturedListener?.({
      name: "tokenResult",
      userInfo: { aliasId: "alias-A" }, // missing token
    });

    const result = await promise;
    expect(result).toBeNull();

    vi.restoreAllMocks();
  });

  it("returns null and cleans up if dispatchMessage throws", async () => {
    stubSafari(() => { throw new Error("dispatch fail"); });
    const { loadToken } = await getBridge();
    const result = await loadToken("alias-err");
    expect(result).toBeNull();
  });
});
