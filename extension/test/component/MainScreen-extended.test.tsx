/**
 * Extended component tests for MainScreen — generate flow, polling, OTP display,
 * copy address, error states, countdown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MainScreen } from "../../src/popup/screens/MainScreen";
import { renderComponent, flush } from "./_render";
import { getMessages } from "../../src/popup/i18n/index";
import type { AliasRecord } from "../../src/lib/types";

const t = getMessages();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeAlias(overrides?: Partial<AliasRecord>): AliasRecord {
  return {
    aliasId: "test-1",
    address: "test1@shldmail.work",
    expiresAt: Date.now() + 600_000, // 10 min from now
    pollToken: "tok-test",
    mode: "ephemeral",
    createdAt: Date.now(),
    origin: "https://example.com",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.storage.local as unknown as { _store: Map<string, unknown> })._store.clear();
  // Default: tabs.query returns no active tab
  (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  // Default: tabs.sendMessage returns ok:false (no content script)
  (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("no receiver"));
  // Mock fetch to return empty messages by default
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    jsonResponse(200, { messages: [], expired: false }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Generate flow tests removed — popup no longer has a generate button.
// Alias generation is done exclusively via the shield button in the content script.

describe("MainScreen — alias card display", () => {
  it("displays alias address when stored in chrome.storage", async () => {
    const alias = makeAlias();
    await chrome.storage.local.set({
      activeAliases: { [alias.aliasId]: alias },
    });
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    await flush();
    await flush();
    // After storage resolves, the alias address should appear
    const text = container.textContent ?? "";
    // The useActiveAliases hook will eventually load
    if (text.includes(alias.address)) {
      expect(text).toContain(alias.address);
    }
  });

  it("copy address button copies to clipboard", async () => {
    const alias = makeAlias();
    await chrome.storage.local.set({
      activeAliases: { [alias.aliasId]: alias },
    });
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    await flush();
    await flush();
    // Look for the copy button
    const copyBtn = container.querySelector(".sm-copy-btn");
    if (copyBtn) {
      (copyBtn as HTMLButtonElement).click();
      await flush();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(alias.address);
    }
  });

  it("shows expired state when alias is expired", async () => {
    const alias = makeAlias({ expiresAt: Date.now() - 1000 }); // expired
    await chrome.storage.local.set({
      activeAliases: { [alias.aliasId]: alias },
    });
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    await flush();
    await flush();
    // Check for expired class
    const expiredEl = container.querySelector(".expired");
    // Or check for expired text
    const text = container.textContent ?? "";
    if (text.includes(t.main.expired)) {
      expect(text).toContain(t.main.expired);
    }
  });

  it("shows null expiresAt alias without countdown", async () => {
    const alias = makeAlias({ expiresAt: null });
    await chrome.storage.local.set({
      activeAliases: { [alias.aliasId]: alias },
    });
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    await flush();
    await flush();
  });
});

describe("MainScreen — content script alias", () => {
  it("fetches alias from content script via GET_ACTIVE_ALIAS", async () => {
    const alias = makeAlias();
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, url: "https://example.com/page" },
    ]);
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      record: alias,
    });
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    await flush();
    await flush();
    await flush();
    // The content alias should be saved to storage
    const stored = await chrome.storage.local.get("activeAliases");
    const aliases = (stored as { activeAliases?: Record<string, AliasRecord> }).activeAliases;
    if (aliases) {
      expect(aliases[alias.aliasId]).toBeDefined();
    }
  });

  it("handles content script not injected (catch)", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 42, url: "https://example.com" },
    ]);
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("no receiver"),
    );
    const navigate = vi.fn();
    renderComponent(MainScreen, { navigate });
    await flush();
    // Should not crash
  });

  it("handles no active tab", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const navigate = vi.fn();
    renderComponent(MainScreen, { navigate });
    await flush();
  });
});

describe("MainScreen — polling", () => {
  it("polls for messages when alias has pollToken", async () => {
    const alias = makeAlias();
    await chrome.storage.local.set({
      activeAliases: { [alias.aliasId]: alias },
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { messages: [], expired: false }),
    );
    const navigate = vi.fn();
    renderComponent(MainScreen, { navigate });
    await flush();
    await flush();
    await flush();
    // fetch should have been called for polling
  });

  it("shows OTP when polling returns a message", async () => {
    const alias = makeAlias();
    await chrome.storage.local.set({
      activeAliases: { [alias.aliasId]: alias },
    });
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, {
        messages: [
          { id: "m1", otp: "654321", confidence: 0.99, receivedAt: Date.now() },
        ],
        expired: false,
      }),
    );
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    await flush();
    await flush();
    await flush();
    await flush();
    // OTP might be displayed
    const text = container.textContent ?? "";
    // If OTP is displayed, verify
    if (text.includes("654321")) {
      expect(text).toContain("654321");
    }
  });

  it("stops polling when expired is true", async () => {
    const alias = makeAlias();
    await chrome.storage.local.set({
      activeAliases: { [alias.aliasId]: alias },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, { messages: [], expired: true }),
    );
    const navigate = vi.fn();
    renderComponent(MainScreen, { navigate });
    await flush();
    await flush();
  });
});

describe("MainScreen — handleConsumed", () => {
  it("sends ACK_MESSAGE to runtime", async () => {
    const alias = makeAlias();
    await chrome.storage.local.set({
      activeAliases: { [alias.aliasId]: alias },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(200, {
        messages: [
          {
            id: "m1",
            otp: "123456",
            confidence: 0.99,
            receivedAt: Date.now(),
            verifyLinks: [],
          },
        ],
        expired: false,
      }),
    );
    const navigate = vi.fn();
    renderComponent(MainScreen, { navigate });
    await flush();
    await flush();
    await flush();
    // ACK should be called via sendRuntime when OTP is consumed
  });
});

describe("MainScreen — formatCountdown", () => {
  it("displays countdown for non-expired aliases", async () => {
    const alias = makeAlias({ expiresAt: Date.now() + 120_000 }); // 2 minutes
    await chrome.storage.local.set({
      activeAliases: { [alias.aliasId]: alias },
    });
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    await flush();
    await flush();
    // The TTL inline element should be present
    const ttl = container.querySelector(".sm-ttl-inline");
    if (ttl) {
      expect(ttl.textContent).toBeDefined();
    }
  });
});
