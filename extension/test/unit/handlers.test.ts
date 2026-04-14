/**
 * Unit tests for background/handlers.ts — dispatch function.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { dispatch, type HandlerDeps } from "../../src/background/handlers";
import { ApiClient, RateLimitError, NetworkError } from "../../src/background/api";
import type { RuntimeMessage, AliasRecord } from "../../src/lib/types";

// Declare the global
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

describe("dispatch() — GENERATE_ALIAS", () => {
  it("returns ok:true on successful generation", async () => {
    const deps = makeDeps();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        aliasId: "a1",
        address: "a1@shldmail.work",
        expiresAt: null,
        pollToken: "tok",
      }),
    );

    const msg: RuntimeMessage = {
      type: "GENERATE_ALIAS",
      mode: "ephemeral",
      origin: "https://example.com",
      label: "Test",
    };
    const result = (await dispatch(msg, deps)) as { ok: boolean; record: AliasRecord };
    expect(result.ok).toBe(true);
    expect(result.record.address).toBe("a1@shldmail.work");
  });

  it("returns error code on rate limit", async () => {
    const deps = makeDeps();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 429, headers: { "retry-after": "30" } }),
    );

    const msg: RuntimeMessage = {
      type: "GENERATE_ALIAS",
      mode: "ephemeral",
      origin: "https://example.com",
    };
    const result = (await dispatch(msg, deps)) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("rate_limited");
  });

  it("starts poller on successful generation", async () => {
    const deps = makeDeps();
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        aliasId: "a2",
        address: "a2@shldmail.work",
        expiresAt: null,
        pollToken: "tok2",
      }),
    );

    const msg: RuntimeMessage = {
      type: "GENERATE_ALIAS",
      mode: "ephemeral",
      origin: "https://example.com",
    };
    await dispatch(msg, deps);
    expect(deps.poller.start).toHaveBeenCalledWith("a2", "tok2", "a2@shldmail.work");
  });
});

describe("dispatch() — STORE_ALIAS", () => {
  it("validates record and returns ok:true for valid input", async () => {
    const deps = makeDeps();
    const record: AliasRecord = {
      aliasId: "store-1",
      address: "store1@shldmail.work",
      expiresAt: null,
      pollToken: "tok",
      mode: "ephemeral",
      createdAt: Date.now(),
    };
    const msg: RuntimeMessage = { type: "STORE_ALIAS", record };
    const result = (await dispatch(msg, deps)) as { ok: boolean };
    expect(result.ok).toBe(true);
  });

  it("rejects invalid record (missing aliasId)", async () => {
    const deps = makeDeps();
    const msg: RuntimeMessage = {
      type: "STORE_ALIAS",
      record: {
        aliasId: "",
        address: "x@y.com",
        expiresAt: null,
        pollToken: "tok",
        mode: "ephemeral",
        createdAt: Date.now(),
      },
    };
    const result = (await dispatch(msg, deps)) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toBe("invalid_record");
  });
});

describe("dispatch() — FETCH_MESSAGES", () => {
  it("returns messages for a known alias", async () => {
    const deps = makeDeps();
    // First, store an alias
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        aliasId: "fm-1",
        address: "fm1@shldmail.work",
        expiresAt: null,
        pollToken: "tok-fm",
      }),
    );
    await dispatch(
      { type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://a.com" },
      deps,
    );

    // Now fetch messages
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, { messages: [{ id: "m1", otp: "123" }], expired: false }),
    );
    const result = (await dispatch(
      { type: "FETCH_MESSAGES", aliasId: "fm-1" },
      deps,
    )) as { ok: boolean; messages: unknown[] };
    expect(result.ok).toBe(true);
    expect(result.messages).toHaveLength(1);
  });

  it("returns error for unknown alias", async () => {
    const deps = makeDeps();
    const result = (await dispatch(
      { type: "FETCH_MESSAGES", aliasId: "unknown" },
      deps,
    )) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
  });
});

describe("dispatch() — ACK_MESSAGE", () => {
  it("returns ok:true on successful ack", async () => {
    const deps = makeDeps();
    // Store alias first
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        aliasId: "ack-1",
        address: "ack@shldmail.work",
        expiresAt: null,
        pollToken: "tok-ack",
      }),
    );
    await dispatch(
      { type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://a.com" },
      deps,
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 204 }),
    );
    const result = (await dispatch(
      { type: "ACK_MESSAGE", aliasId: "ack-1", messageId: "m1" },
      deps,
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
  });
});

describe("dispatch() — DELETE_ALIAS", () => {
  it("returns ok:true and stops poller", async () => {
    const deps = makeDeps();
    // Store alias first
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        aliasId: "del-1",
        address: "del@shldmail.work",
        expiresAt: null,
        pollToken: "tok-del",
      }),
    );
    await dispatch(
      { type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://a.com" },
      deps,
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 204 }),
    );
    const result = (await dispatch(
      { type: "DELETE_ALIAS", aliasId: "del-1" },
      deps,
    )) as { ok: boolean };
    expect(result.ok).toBe(true);
    expect(deps.poller.stop).toHaveBeenCalledWith("del-1");
  });
});

describe("dispatch() — unknown type", () => {
  it("returns undefined for unhandled message types", async () => {
    const deps = makeDeps();
    const result = await dispatch(
      { type: "DETECT_RESULT", score: 0.9, activated: true } as RuntimeMessage,
      deps,
    );
    expect(result).toBeUndefined();
  });
});
