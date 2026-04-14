import { describe, it, expect, vi } from "vitest";
import { TokenBucket } from "../../src/do/TokenBucket.js";
import type { Env } from "../../src/types/env.js";

/**
 * Unit tests for src/do/TokenBucket.ts — rate limiter Durable Object.
 *
 * Mocks DurableObjectState to run in the node vitest environment.
 */

function makeMockStorage() {
  const store = new Map<string, unknown>();
  return {
    store,
    storage: {
      get: vi.fn().mockImplementation(async (key: string) => store.get(key)),
      put: vi.fn().mockImplementation(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    } as unknown as DurableObjectStorage,
  };
}

function makeMockState(storage: DurableObjectStorage): DurableObjectState {
  return { storage } as unknown as DurableObjectState;
}

function makeMockEnv(): Env {
  return {
    ALIAS_KV: {} as KVNamespace,
    MSG_DO: {} as DurableObjectNamespace,
    RATE_LIMIT: {} as DurableObjectNamespace,
    DAILY_QUOTA: {} as DurableObjectNamespace,
    DOMAIN_POOL: "d1.test.shld.me",
    MESSAGE_TTL_MS: "600000",
    EPHEMERAL_ALIAS_TTL_SEC: "3600",
    POLL_TOKEN_TTL_SEC: "7200",
    HMAC_KEY: "test-key",
  } as unknown as Env;
}

function makeCheckRequest(body: {
  capacity?: number;
  refillPerSec?: number;
  cost?: number;
}): Request {
  return new Request("https://do.internal/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("TokenBucket — POST /check", () => {
  it("allows the first request with full bucket", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const bucket = new TokenBucket(state, env);

    const resp = await bucket.fetch(
      makeCheckRequest({ capacity: 10, refillPerSec: 1 }),
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      allowed: boolean;
      remaining: number;
    };
    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(9); // 10 - 1 cost
  });

  it("depletes the bucket and returns 429", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const bucket = new TokenBucket(state, env);

    // Drain the bucket with capacity=3
    for (let i = 0; i < 3; i++) {
      await bucket.fetch(
        makeCheckRequest({ capacity: 3, refillPerSec: 0.001 }),
      );
    }

    // Next request should be denied
    const resp = await bucket.fetch(
      makeCheckRequest({ capacity: 3, refillPerSec: 0.001 }),
    );
    expect(resp.status).toBe(429);
    const body = (await resp.json()) as {
      allowed: boolean;
      retryAfterMs: number;
    };
    expect(body.allowed).toBe(false);
    expect(typeof body.retryAfterMs).toBe("number");
    expect(body.retryAfterMs).toBeGreaterThan(0);
  });

  it("refills tokens over time", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const bucket = new TokenBucket(state, env);

    // Drain bucket
    for (let i = 0; i < 5; i++) {
      await bucket.fetch(
        makeCheckRequest({ capacity: 5, refillPerSec: 1000 }),
      );
    }

    // Simulate time passing by modifying stored state
    const stored = mock.store.get("bucket:state") as {
      tokens: number;
      lastRefillMs: number;
    };
    // Set lastRefillMs to 5 seconds ago — with refillPerSec=1000, should refill fully
    stored.lastRefillMs = Date.now() - 5000;
    mock.store.set("bucket:state", stored);

    const resp = await bucket.fetch(
      makeCheckRequest({ capacity: 5, refillPerSec: 1000 }),
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { allowed: boolean };
    expect(body.allowed).toBe(true);
  });

  it("handles custom cost parameter", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const bucket = new TokenBucket(state, env);

    // Cost of 3 out of capacity 5
    const resp = await bucket.fetch(
      makeCheckRequest({ capacity: 5, refillPerSec: 1, cost: 3 }),
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { remaining: number };
    expect(body.remaining).toBe(2); // 5 - 3
  });

  it("handles default values for missing parameters", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const bucket = new TokenBucket(state, env);

    // Empty body — should use defaults: capacity=30, refillPerSec=1, cost=1
    const resp = await bucket.fetch(
      makeCheckRequest({}),
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      allowed: boolean;
      remaining: number;
    };
    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(29); // 30 - 1
  });

  it("rejects when cost exceeds remaining tokens", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const bucket = new TokenBucket(state, env);

    // Cost=10, capacity=5 — should be denied immediately
    const resp = await bucket.fetch(
      makeCheckRequest({ capacity: 5, refillPerSec: 1, cost: 10 }),
    );
    expect(resp.status).toBe(429);
    const body = (await resp.json()) as {
      allowed: boolean;
      retryAfterMs: number;
    };
    expect(body.allowed).toBe(false);
  });
});

describe("TokenBucket — unknown route", () => {
  it("returns 404 for non-/check paths", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const bucket = new TokenBucket(state, env);

    const resp = await bucket.fetch(
      new Request("https://do.internal/unknown"),
    );
    expect(resp.status).toBe(404);
  });

  it("returns 404 for GET /check", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const bucket = new TokenBucket(state, env);

    const resp = await bucket.fetch(
      new Request("https://do.internal/check"),
    );
    expect(resp.status).toBe(404);
  });
});
