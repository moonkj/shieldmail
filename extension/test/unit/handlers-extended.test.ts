/**
 * Extended unit tests for background/handlers.ts — FETCH_MESSAGES demo path,
 * ACK_MESSAGE demo/error, DELETE_ALIAS demo/error, STORE_ALIAS validations,
 * GENERATE_ALIAS managed mode + dev fallback.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatch, type HandlerDeps } from "../../src/background/handlers";
import { ApiClient, RateLimitError, NetworkError, TokenRevokedError, AliasExpiredError } from "../../src/background/api";
import type { RuntimeMessage, AliasRecord } from "../../src/lib/types";

declare const __SHIELDMAIL_DEV__: boolean;

function makeDeps(): HandlerDeps {
  const api = new ApiClient("https://api.test");
  const poller = {
    start: vi.fn(async () => {}),
    stop: vi.fn(async () => {}),
    rehydrateAll: vi.fn(async () => {}),
    onAlarm: vi.fn(async () => {}),
    pauseForSse: vi.fn(async () => {}),
    resumeFromSse: vi.fn(async () => {}),
  };
  return { api, poller } as unknown as HandlerDeps;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  (chrome.storage.local as unknown as { _store: Map<string, unknown> })._store.clear();
});

describe("dispatch() — GENERATE_ALIAS extended", () => {
  it("saves managed alias to managedAliases storage", async () => {
    const deps = makeDeps();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        aliasId: "mgd-1",
        address: "mgd1@shldmail.work",
        expiresAt: null,
        pollToken: "tok-mgd",
      }),
    );
    const msg: RuntimeMessage = {
      type: "GENERATE_ALIAS",
      mode: "managed",
      origin: "https://example.com",
      label: "Test Managed",
    };
    const result = (await dispatch(msg, deps)) as { ok: boolean; record: AliasRecord };
    expect(result.ok).toBe(true);
    expect(result.record.mode).toBe("managed");
    // Check managedAliases in storage
    const stored = await chrome.storage.local.get("managedAliases");
    const managed = (stored as { managedAliases?: Record<string, AliasRecord> }).managedAliases;
    expect(managed?.["mgd-1"]).toBeDefined();
  });

  it("returns error on token revoked", async () => {
    const deps = makeDeps();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 401 }),
    );
    const msg: RuntimeMessage = {
      type: "GENERATE_ALIAS",
      mode: "ephemeral",
      origin: "https://example.com",
    };
    const result = (await dispatch(msg, deps)) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("token_revoked");
  });

  it("returns error on alias expired", async () => {
    const deps = makeDeps();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 410 }),
    );
    const msg: RuntimeMessage = {
      type: "GENERATE_ALIAS",
      mode: "ephemeral",
      origin: "https://example.com",
    };
    const result = (await dispatch(msg, deps)) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("alias_expired");
  });

  it("falls back to demo alias in dev mode on network error", async () => {
    const deps = makeDeps();
    // Simulate a generic error (not rate-limit/token/expired)
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const msg: RuntimeMessage = {
      type: "GENERATE_ALIAS",
      mode: "ephemeral",
      origin: "https://example.com",
      label: "demo-test",
    };
    const result = (await dispatch(msg, deps)) as { ok: boolean; record?: AliasRecord; error?: string };
    // In dev mode (__SHIELDMAIL_DEV__=true), should return a demo alias with ok:true
    if (__SHIELDMAIL_DEV__) {
      expect(result.ok).toBe(true);
      expect(result.record?.pollToken).toMatch(/^demo:/);
    } else {
      expect(result.ok).toBe(false);
    }
  });

  it("demo alias for managed mode is stored in managedAliases", async () => {
    const deps = makeDeps();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const msg: RuntimeMessage = {
      type: "GENERATE_ALIAS",
      mode: "managed",
      origin: "https://example.com",
    };
    const result = (await dispatch(msg, deps)) as { ok: boolean; record?: AliasRecord };
    if (__SHIELDMAIL_DEV__) {
      expect(result.ok).toBe(true);
      const stored = await chrome.storage.local.get("managedAliases");
      const managed = (stored as { managedAliases?: Record<string, AliasRecord> }).managedAliases ?? {};
      expect(Object.keys(managed).length).toBe(1);
    }
  });
});

describe("dispatch() — FETCH_MESSAGES extended", () => {
  it("returns demo OTP for demo alias", async () => {
    const deps = makeDeps();
    // Store a demo alias
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    await dispatch(
      { type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://a.com" },
      deps,
    );
    // Get the stored alias
    const stored = await chrome.storage.local.get("activeAliases");
    const aliases = (stored as { activeAliases: Record<string, AliasRecord> }).activeAliases;
    const aliasId = Object.values(aliases)[0]?.aliasId;
    if (!aliasId) return; // production mode — skip

    const result = (await dispatch(
      { type: "FETCH_MESSAGES", aliasId },
      deps,
    )) as { ok: boolean; messages: Array<{ otp: string }> };
    expect(result.ok).toBe(true);
    expect(result.messages[0]?.otp).toBeDefined();
  });

  it("returns error when API call fails", async () => {
    const deps = makeDeps();
    // Store a real (non-demo) alias
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        aliasId: "err-1",
        address: "err1@shldmail.work",
        expiresAt: null,
        pollToken: "tok-err",
      }),
    );
    await dispatch(
      { type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://a.com" },
      deps,
    );

    // Now fetch messages fails with network error
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    const result = (await dispatch(
      { type: "FETCH_MESSAGES", aliasId: "err-1" },
      deps,
    )) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    // NetworkError maps to "network_unavailable", generic Error maps to "unknown"
    expect(["unknown", "network_unavailable"]).toContain(result.error);
  });

  it("looks up alias in managedAliases when not in active", async () => {
    const deps = makeDeps();
    // Directly store a managed alias in storage
    const alias: AliasRecord = {
      aliasId: "mgd-fetch",
      address: "mgd@shldmail.work",
      expiresAt: null,
      pollToken: "tok-mgd-fetch",
      mode: "managed",
      createdAt: Date.now(),
    };
    await chrome.storage.local.set({ managedAliases: { "mgd-fetch": alias } });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, { messages: [{ id: "m1", otp: "111" }], expired: false }),
    );
    const result = (await dispatch(
      { type: "FETCH_MESSAGES", aliasId: "mgd-fetch" },
      deps,
    )) as { ok: boolean; messages: unknown[] };
    expect(result.ok).toBe(true);
    expect(result.messages).toHaveLength(1);
  });
});

describe("dispatch() — ACK_MESSAGE extended", () => {
  it("returns ok:true for demo alias (no-op)", async () => {
    const deps = makeDeps();
    // Store a demo alias
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    await dispatch(
      { type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://a.com" },
      deps,
    );
    const stored = await chrome.storage.local.get("activeAliases");
    const aliases = (stored as { activeAliases: Record<string, AliasRecord> }).activeAliases;
    const aliasId = Object.values(aliases)[0]?.aliasId;
    if (!aliasId) return;

    const result = (await dispatch(
      { type: "ACK_MESSAGE", aliasId, messageId: "m1" },
      deps,
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
  });

  it("returns error for unknown alias", async () => {
    const deps = makeDeps();
    const result = (await dispatch(
      { type: "ACK_MESSAGE", aliasId: "nonexistent", messageId: "m1" },
      deps,
    )) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("unknown");
  });

  it("returns error when API call fails", async () => {
    const deps = makeDeps();
    // Store a real alias
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        aliasId: "ack-err",
        address: "ack@shldmail.work",
        expiresAt: null,
        pollToken: "tok-ack-err",
      }),
    );
    await dispatch(
      { type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://a.com" },
      deps,
    );

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));
    const result = (await dispatch(
      { type: "ACK_MESSAGE", aliasId: "ack-err", messageId: "m1" },
      deps,
    )) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
  });
});

describe("dispatch() — DELETE_ALIAS extended", () => {
  it("handles demo alias (skips API call, does local cleanup)", async () => {
    const deps = makeDeps();
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("offline"));
    await dispatch(
      { type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://a.com" },
      deps,
    );
    const stored = await chrome.storage.local.get("activeAliases");
    const aliases = (stored as { activeAliases: Record<string, AliasRecord> }).activeAliases;
    const aliasId = Object.values(aliases)[0]?.aliasId;
    if (!aliasId) return;

    const result = (await dispatch(
      { type: "DELETE_ALIAS", aliasId },
      deps,
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(deps.poller.stop).toHaveBeenCalledWith(aliasId);
  });

  it("handles API failure during delete (continues local cleanup)", async () => {
    const deps = makeDeps();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        aliasId: "del-err",
        address: "del@shldmail.work",
        expiresAt: null,
        pollToken: "tok-del-err",
      }),
    );
    await dispatch(
      { type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://a.com" },
      deps,
    );

    // Delete API call fails
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("server error"));
    const result = (await dispatch(
      { type: "DELETE_ALIAS", aliasId: "del-err" },
      deps,
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(deps.poller.stop).toHaveBeenCalledWith("del-err");
  });

  it("deletes unknown alias (no API call needed)", async () => {
    const deps = makeDeps();
    const result = (await dispatch(
      { type: "DELETE_ALIAS", aliasId: "nonexistent" },
      deps,
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(deps.poller.stop).toHaveBeenCalledWith("nonexistent");
  });

  it("cleans up managed alias as well", async () => {
    const deps = makeDeps();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        aliasId: "mgd-del",
        address: "mgd-del@shldmail.work",
        expiresAt: null,
        pollToken: "tok-mgd-del",
      }),
    );
    await dispatch(
      { type: "GENERATE_ALIAS", mode: "managed", origin: "https://a.com" },
      deps,
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 204 }),
    );
    const result = (await dispatch(
      { type: "DELETE_ALIAS", aliasId: "mgd-del" },
      deps,
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
    // managedAliases should be cleaned up
    const stored = await chrome.storage.local.get("managedAliases");
    const managed = (stored as { managedAliases?: Record<string, AliasRecord> }).managedAliases ?? {};
    expect(managed["mgd-del"]).toBeUndefined();
  });
});

describe("dispatch() — STORE_ALIAS extended validations", () => {
  it("rejects missing address", async () => {
    const deps = makeDeps();
    const result = (await dispatch(
      {
        type: "STORE_ALIAS",
        record: {
          aliasId: "x",
          address: "",
          expiresAt: null,
          pollToken: "tok",
          mode: "ephemeral",
          createdAt: Date.now(),
        },
      },
      deps,
    )) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_record");
  });

  it("rejects missing pollToken", async () => {
    const deps = makeDeps();
    const result = (await dispatch(
      {
        type: "STORE_ALIAS",
        record: {
          aliasId: "x",
          address: "x@test.com",
          expiresAt: null,
          pollToken: "",
          mode: "ephemeral",
          createdAt: Date.now(),
        },
      },
      deps,
    )) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_record");
  });

  it("rejects invalid mode", async () => {
    const deps = makeDeps();
    const result = (await dispatch(
      {
        type: "STORE_ALIAS",
        record: {
          aliasId: "x",
          address: "x@test.com",
          expiresAt: null,
          pollToken: "tok",
          mode: "invalid" as "ephemeral",
          createdAt: Date.now(),
        },
      },
      deps,
    )) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_record");
  });

  it("rejects missing createdAt", async () => {
    const deps = makeDeps();
    const result = (await dispatch(
      {
        type: "STORE_ALIAS",
        record: {
          aliasId: "x",
          address: "x@test.com",
          expiresAt: null,
          pollToken: "tok",
          mode: "ephemeral",
          createdAt: "not-a-number" as unknown as number,
        },
      },
      deps,
    )) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_record");
  });

  it("stores managed mode alias in managedAliases", async () => {
    const deps = makeDeps();
    const record: AliasRecord = {
      aliasId: "store-mgd",
      address: "store-mgd@test.com",
      expiresAt: null,
      pollToken: "tok-store",
      mode: "managed",
      createdAt: Date.now(),
    };
    const result = (await dispatch(
      { type: "STORE_ALIAS", record },
      deps,
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
    const stored = await chrome.storage.local.get("managedAliases");
    const managed = (stored as { managedAliases?: Record<string, AliasRecord> }).managedAliases ?? {};
    expect(managed["store-mgd"]).toBeDefined();
  });

  it("starts poller for stored alias", async () => {
    const deps = makeDeps();
    const record: AliasRecord = {
      aliasId: "store-poll",
      address: "store-poll@test.com",
      expiresAt: null,
      pollToken: "tok-poll",
      mode: "ephemeral",
      createdAt: Date.now(),
    };
    await dispatch({ type: "STORE_ALIAS", record }, deps);
    expect(deps.poller.start).toHaveBeenCalledWith("store-poll", "tok-poll", "store-poll@test.com");
  });
});
