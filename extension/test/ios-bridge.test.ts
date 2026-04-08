/**
 * ios-bridge.ts — unit tests.
 *
 * Covers: haptic (Web Vibration API), storeToken, loadToken, appendRecentAlias
 * (all backed by chrome.storage.local in the MVP — no native messaging).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// In-memory chrome.storage.local mock.
function makeStorageMock(): Record<string, unknown> {
  const store: Record<string, unknown> = {};
  (globalThis as Record<string, unknown>).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key: string | string[] | null) => {
          if (key === null || key === undefined) return { ...store };
          if (typeof key === "string") {
            return key in store ? { [key]: store[key] } : {};
          }
          const out: Record<string, unknown> = {};
          for (const k of key) if (k in store) out[k] = store[k];
          return out;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
      },
    },
  };
  return store;
}

async function getBridge() {
  return import("../src/content/ios-bridge");
}

beforeEach(() => {
  vi.resetModules();
  makeStorageMock();
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).chrome;
});

describe("haptic()", () => {
  it("calls navigator.vibrate when available — light", async () => {
    const vib = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vib, configurable: true });
    const { haptic } = await getBridge();
    haptic("light");
    expect(vib).toHaveBeenCalledWith(10);
  });

  it("calls navigator.vibrate — medium", async () => {
    const vib = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vib, configurable: true });
    const { haptic } = await getBridge();
    haptic("medium");
    expect(vib).toHaveBeenCalledWith(20);
  });

  it("calls navigator.vibrate — heavy", async () => {
    const vib = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vib, configurable: true });
    const { haptic } = await getBridge();
    haptic("heavy");
    expect(vib).toHaveBeenCalledWith(40);
  });

  it("falls back to medium pattern for unknown style", async () => {
    const vib = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vib, configurable: true });
    const { haptic } = await getBridge();
    haptic("nonsense-style");
    expect(vib).toHaveBeenCalledWith(20);
  });

  it("silently no-ops when navigator.vibrate is undefined", async () => {
    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true });
    const { haptic } = await getBridge();
    expect(() => haptic("medium")).not.toThrow();
  });

  it("silently swallows exceptions from navigator.vibrate", async () => {
    Object.defineProperty(navigator, "vibrate", {
      value: () => { throw new Error("not allowed"); },
      configurable: true,
    });
    const { haptic } = await getBridge();
    expect(() => haptic("medium")).not.toThrow();
  });
});

describe("storeToken() / loadToken()", () => {
  it("storeToken persists under sm_token_<aliasId>", async () => {
    const { storeToken } = await getBridge();
    await storeToken("alias-abc", "jwt.tok.en");
    const set = chrome.storage.local.set as ReturnType<typeof vi.fn>;
    expect(set).toHaveBeenCalledWith({ "sm_token_alias-abc": "jwt.tok.en" });
    // Verify round-trip via the get mock.
    const result = await chrome.storage.local.get("sm_token_alias-abc");
    expect(result).toEqual({ "sm_token_alias-abc": "jwt.tok.en" });
  });

  it("loadToken returns the previously stored token", async () => {
    const { storeToken, loadToken } = await getBridge();
    await storeToken("alias-xyz", "secret-jwt");
    const loaded = await loadToken("alias-xyz");
    expect(loaded).toBe("secret-jwt");
  });

  it("loadToken returns null when no token exists", async () => {
    const { loadToken } = await getBridge();
    const result = await loadToken("never-seen");
    expect(result).toBeNull();
  });

  it("loadToken returns null when chrome.storage throws", async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("storage err"),
    );
    const { loadToken } = await getBridge();
    const result = await loadToken("any");
    expect(result).toBeNull();
  });

  it("storeToken silently swallows storage errors", async () => {
    (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("storage err"),
    );
    const { storeToken } = await getBridge();
    await expect(storeToken("a", "b")).resolves.toBeUndefined();
  });
});

describe("appendRecentAlias()", () => {
  it("stores a single alias under sm_recent_aliases", async () => {
    const { appendRecentAlias } = await getBridge();
    await appendRecentAlias({ aliasId: "abc", address: "abc@d1.shld.me" });
    const result = await chrome.storage.local.get("sm_recent_aliases");
    expect(result).toEqual({
      sm_recent_aliases: [{ aliasId: "abc", address: "abc@d1.shld.me" }],
    });
  });

  it("includes optional label", async () => {
    const { appendRecentAlias } = await getBridge();
    await appendRecentAlias({ aliasId: "x", address: "x@d.me", label: "GitHub" });
    const result = await chrome.storage.local.get("sm_recent_aliases");
    const list = (result as { sm_recent_aliases: unknown[] }).sm_recent_aliases;
    expect(list[0]).toEqual({ aliasId: "x", address: "x@d.me", label: "GitHub" });
  });

  it("prepends newest alias and dedupes by aliasId", async () => {
    const { appendRecentAlias } = await getBridge();
    await appendRecentAlias({ aliasId: "1", address: "1@d.me" });
    await appendRecentAlias({ aliasId: "2", address: "2@d.me" });
    await appendRecentAlias({ aliasId: "1", address: "1-new@d.me" }); // dedup + bump
    const result = await chrome.storage.local.get("sm_recent_aliases");
    const list = (result as { sm_recent_aliases: { aliasId: string; address: string }[] }).sm_recent_aliases;
    expect(list).toHaveLength(2);
    expect(list[0]?.aliasId).toBe("1");
    expect(list[0]?.address).toBe("1-new@d.me");
    expect(list[1]?.aliasId).toBe("2");
  });

  it("caps the list at 3 entries", async () => {
    const { appendRecentAlias } = await getBridge();
    await appendRecentAlias({ aliasId: "1", address: "1@d.me" });
    await appendRecentAlias({ aliasId: "2", address: "2@d.me" });
    await appendRecentAlias({ aliasId: "3", address: "3@d.me" });
    await appendRecentAlias({ aliasId: "4", address: "4@d.me" });
    const result = await chrome.storage.local.get("sm_recent_aliases");
    const list = (result as { sm_recent_aliases: { aliasId: string }[] }).sm_recent_aliases;
    expect(list).toHaveLength(3);
    expect(list.map((a) => a.aliasId)).toEqual(["4", "3", "2"]);
  });

  it("silently swallows storage errors", async () => {
    (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("storage err"),
    );
    const { appendRecentAlias } = await getBridge();
    await expect(
      appendRecentAlias({ aliasId: "a", address: "a@d.me" }),
    ).resolves.toBeUndefined();
  });
});
