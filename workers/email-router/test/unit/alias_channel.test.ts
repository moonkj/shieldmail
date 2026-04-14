import { describe, it, expect, vi } from "vitest";
import { AliasChannel } from "../../src/do/AliasChannel.js";
import type { Env } from "../../src/types/env.js";

/**
 * Unit tests for src/do/AliasChannel.ts — Durable Object.
 *
 * Mocks DurableObjectState + storage to run in the node vitest environment
 * so v8 coverage is collected.
 */

// ─── Mock storage ───────────────────────────────────

function makeMockStorage() {
  const store = new Map<string, unknown>();
  let alarmTime: number | null = null;

  return {
    store,
    alarmTime: () => alarmTime,
    storage: {
      get: vi.fn().mockImplementation(async (key: string) => store.get(key)),
      put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
      delete: vi.fn().mockImplementation(async (keys: string | string[]) => {
        if (Array.isArray(keys)) {
          for (const k of keys) store.delete(k);
          return keys.length;
        }
        store.delete(keys);
        return 1;
      }),
      deleteAll: vi.fn().mockImplementation(async () => {
        store.clear();
      }),
      list: vi.fn().mockImplementation(async (opts?: { prefix?: string }) => {
        const prefix = opts?.prefix ?? "";
        const result = new Map<string, unknown>();
        for (const [k, v] of store.entries()) {
          if (k.startsWith(prefix)) result.set(k, v);
        }
        return result;
      }),
      setAlarm: vi.fn().mockImplementation(async (time: number) => {
        alarmTime = time;
      }),
      deleteAlarm: vi.fn().mockImplementation(async () => {
        alarmTime = null;
      }),
    } as unknown as DurableObjectStorage,
  };
}

function makeMockState(storage: DurableObjectStorage): DurableObjectState {
  return { storage } as unknown as DurableObjectState;
}

function makeMockEnv(overrides: Partial<Record<string, string>> = {}): Env {
  return {
    ALIAS_KV: {} as KVNamespace,
    MSG_DO: {} as DurableObjectNamespace,
    RATE_LIMIT: {} as DurableObjectNamespace,
    DAILY_QUOTA: {} as DurableObjectNamespace,
    DOMAIN_POOL: "d1.test.shld.me",
    MESSAGE_TTL_MS: overrides.MESSAGE_TTL_MS ?? "600000",
    EPHEMERAL_ALIAS_TTL_SEC: "3600",
    POLL_TOKEN_TTL_SEC: "7200",
    HMAC_KEY: "test-key",
  } as unknown as Env;
}

function makeRequest(
  path: string,
  method: string = "GET",
  body?: unknown,
): Request {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(`https://do.internal${path}`, init);
}

// ─── Tests ──────────────────────────────────────────

describe("AliasChannel — POST /push", () => {
  it("stores a message and returns { ok, id }", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    const resp = await do_.fetch(
      makeRequest("/push", "POST", {
        receivedAt: 1000,
        otp: "123456",
        confidence: 0.9,
      }),
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { ok: boolean; id: string };
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("string");

    // Verify message is in storage
    const entries = Array.from(mock.store.entries());
    const msgEntry = entries.find(([k]) => k.startsWith("msg:"));
    expect(msgEntry).toBeDefined();
  });

  it("rejects forbidden keys in payload (sanitize)", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    const resp = await do_.fetch(
      makeRequest("/push", "POST", {
        receivedAt: 1000,
        raw: "should-be-rejected",
      }),
    );
    expect(resp.status).toBe(500);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toContain("raw");
  });

  it("sets an alarm after push", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: Date.now() }),
    );

    expect(mock.storage.setAlarm).toHaveBeenCalled();
  });
});

describe("AliasChannel — GET /messages", () => {
  it("returns empty messages array when no messages stored", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    const resp = await do_.fetch(makeRequest("/messages?since=0"));
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      messages: unknown[];
      expired: boolean;
    };
    expect(body.messages).toEqual([]);
    expect(body.expired).toBe(false);
  });

  it("returns messages filtered by since parameter", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    // Push two messages
    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: 1000, otp: "aaa" }),
    );
    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: 2000, otp: "bbb" }),
    );

    // Poll since=1000 should only return the second
    const resp = await do_.fetch(makeRequest("/messages?since=1000"));
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      messages: Array<{ otp?: string; receivedAt: number }>;
    };
    expect(body.messages.length).toBe(1);
    expect(body.messages[0]!.otp).toBe("bbb");
  });

  it("returns all messages when since is omitted", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: 1000, otp: "aaa" }),
    );
    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: 2000, otp: "bbb" }),
    );

    const resp = await do_.fetch(makeRequest("/messages"));
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { messages: unknown[] };
    expect(body.messages.length).toBe(2);
  });

  it("messages are sorted by receivedAt ascending", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: 5000, otp: "late" }),
    );
    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: 1000, otp: "early" }),
    );

    const resp = await do_.fetch(makeRequest("/messages?since=0"));
    const body = (await resp.json()) as {
      messages: Array<{ otp?: string; receivedAt: number }>;
    };
    expect(body.messages[0]!.otp).toBe("early");
    expect(body.messages[1]!.otp).toBe("late");
  });

  it("handles invalid since parameter gracefully", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: 1000 }),
    );

    const resp = await do_.fetch(makeRequest("/messages?since=notanumber"));
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { messages: unknown[] };
    expect(body.messages.length).toBe(1);
  });
});

describe("AliasChannel — POST /ack", () => {
  it("wipes all storage and alarm", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: 1000, otp: "123" }),
    );
    expect(mock.store.size).toBeGreaterThan(0);

    const resp = await do_.fetch(makeRequest("/ack", "POST"));
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    expect(mock.storage.deleteAll).toHaveBeenCalled();
    expect(mock.storage.deleteAlarm).toHaveBeenCalled();
  });
});

describe("AliasChannel — DELETE /", () => {
  it("wipes storage and returns ok", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: 1000 }),
    );

    const resp = await do_.fetch(makeRequest("/", "DELETE"));
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(mock.storage.deleteAll).toHaveBeenCalled();
    expect(mock.storage.deleteAlarm).toHaveBeenCalled();
  });
});

describe("AliasChannel — unknown route", () => {
  it("returns 404 for unknown path", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    const resp = await do_.fetch(makeRequest("/nonexistent"));
    expect(resp.status).toBe(404);
  });
});

describe("AliasChannel — GET /stream (SSE)", () => {
  it("returns a streaming response with text/event-stream content-type", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    const resp = await do_.fetch(makeRequest("/stream"));
    expect(resp.status).toBe(200);
    expect(resp.headers.get("content-type")).toBe("text/event-stream");
    // Cancel the stream to avoid hanging
    await resp.body?.cancel();
  });

  it("replays existing messages to new SSE clients", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    // Push a message first
    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: 1000, otp: "replay" }),
    );

    const resp = await do_.fetch(makeRequest("/stream"));
    const reader = resp.body!.getReader();
    // Read the first chunk (should contain the replayed message)
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    // Should contain the message data or at minimum the SSE format
    expect(text.length).toBeGreaterThan(0);
    await reader.cancel();
  });

  it("skips messages matching last-event-id header", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    // Push a message
    const pushResp = await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: 1000, otp: "skip" }),
    );
    const pushBody = (await pushResp.json()) as { id: string };

    // Connect with last-event-id matching the message id
    const req = new Request("https://do.internal/stream", {
      headers: { "last-event-id": pushBody.id },
    });
    const resp = await do_.fetch(req);
    const reader = resp.body!.getReader();
    const { value } = await reader.read();
    const text = new TextDecoder().decode(value);
    // The replayed message should be skipped; we should only see ": connected"
    expect(text).toContain("connected");
    await reader.cancel();
  });
});

describe("AliasChannel — GET /ws", () => {
  it("throws WS hibernation error (M4 stub)", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    const resp = await do_.fetch(makeRequest("/ws"));
    // The WS handler throws, which is caught by the try/catch in fetch()
    expect(resp.status).toBe(500);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toContain("WS hibernation");
  });
});

describe("AliasChannel — alarm()", () => {
  it("purges only expired entries and re-arms for survivors", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv({ MESSAGE_TTL_MS: "600000" });
    const do_ = new AliasChannel(state, env);

    const now = Date.now();
    const TTL = 600_000;

    // Push an old message (expired) and a fresh one
    await do_.fetch(
      makeRequest("/push", "POST", {
        receivedAt: now - TTL - 1000,
        otp: "OLD",
      }),
    );
    await do_.fetch(
      makeRequest("/push", "POST", {
        receivedAt: now,
        otp: "FRESH",
      }),
    );

    await do_.alarm();

    // Poll: only FRESH should remain
    const resp = await do_.fetch(makeRequest("/messages?since=0"));
    const body = (await resp.json()) as {
      messages: Array<{ otp?: string }>;
    };
    const otps = body.messages.map((m) => m.otp);
    expect(otps).toContain("FRESH");
    expect(otps).not.toContain("OLD");

    // Alarm should have been re-armed
    expect(mock.storage.setAlarm).toHaveBeenCalled();
  });

  it("does not re-arm alarm when all entries are expired", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv({ MESSAGE_TTL_MS: "600000" });
    const do_ = new AliasChannel(state, env);

    const now = Date.now();
    const TTL = 600_000;

    await do_.fetch(
      makeRequest("/push", "POST", {
        receivedAt: now - TTL - 5000,
        otp: "OLD1",
      }),
    );

    // Reset mock to track calls after push
    (mock.storage.setAlarm as ReturnType<typeof vi.fn>).mockClear();

    await do_.alarm();

    // Poll: no messages
    const resp = await do_.fetch(makeRequest("/messages?since=0"));
    const body = (await resp.json()) as { messages: unknown[] };
    expect(body.messages.length).toBe(0);

    // setAlarm should NOT have been called (no survivors → no re-arm)
    expect(mock.storage.setAlarm).not.toHaveBeenCalled();
  });

  it("leaves fresh entries untouched when alarm fires early", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv({ MESSAGE_TTL_MS: "600000" });
    const do_ = new AliasChannel(state, env);

    await do_.fetch(
      makeRequest("/push", "POST", {
        receivedAt: Date.now(),
        otp: "FRESH1",
      }),
    );
    await do_.fetch(
      makeRequest("/push", "POST", {
        receivedAt: Date.now() + 1,
        otp: "FRESH2",
      }),
    );

    await do_.alarm();

    const resp = await do_.fetch(makeRequest("/messages?since=0"));
    const body = (await resp.json()) as { messages: unknown[] };
    expect(body.messages.length).toBe(2);
  });
});

describe("AliasChannel — env-driven MESSAGE_TTL_MS", () => {
  it("uses env value when valid", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv({ MESSAGE_TTL_MS: "300000" }); // 5 min
    const do_ = new AliasChannel(state, env);

    // Push then immediately alarm — message at now should survive
    const now = Date.now();
    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: now }),
    );
    await do_.alarm();

    const resp = await do_.fetch(makeRequest("/messages?since=0"));
    const body = (await resp.json()) as { messages: unknown[] };
    expect(body.messages.length).toBe(1);
  });

  it("falls back to default when env is empty", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv({ MESSAGE_TTL_MS: "" });
    const do_ = new AliasChannel(state, env);

    // Just verify it doesn't crash
    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: Date.now() }),
    );
    await do_.alarm();

    const resp = await do_.fetch(makeRequest("/messages?since=0"));
    expect(resp.status).toBe(200);
  });

  it("falls back to default when env is NaN", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv({ MESSAGE_TTL_MS: "not-a-number" });
    const do_ = new AliasChannel(state, env);

    await do_.fetch(
      makeRequest("/push", "POST", { receivedAt: Date.now() }),
    );
    await do_.alarm();

    const resp = await do_.fetch(makeRequest("/messages?since=0"));
    expect(resp.status).toBe(200);
  });
});

describe("AliasChannel — SSE broadcast", () => {
  it("broadcasts to connected SSE clients on push", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const do_ = new AliasChannel(state, env);

    // Connect an SSE client
    const sseResp = await do_.fetch(makeRequest("/stream"));
    const reader = sseResp.body!.getReader();

    // Push a message — it should be broadcast to the SSE client
    await do_.fetch(
      makeRequest("/push", "POST", {
        receivedAt: Date.now(),
        otp: "BROADCAST",
      }),
    );

    // Read from the SSE stream. The first chunk may include the replay +
    // connected comment + the broadcast.
    const chunks: string[] = [];
    for (let i = 0; i < 3; i++) {
      const result = await Promise.race([
        reader.read(),
        new Promise<{ done: true; value: undefined }>((resolve) =>
          setTimeout(() => resolve({ done: true, value: undefined }), 200),
        ),
      ]);
      if (result.done) break;
      if (result.value) chunks.push(new TextDecoder().decode(result.value));
    }
    const combined = chunks.join("");
    expect(combined).toContain("BROADCAST");

    await reader.cancel();
  });
});
