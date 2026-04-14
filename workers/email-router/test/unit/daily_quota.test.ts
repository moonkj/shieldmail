import { describe, it, expect, vi } from "vitest";
import { DailyQuota } from "../../src/do/DailyQuota.js";
import type { Env } from "../../src/types/env.js";

/**
 * Unit tests for src/do/DailyQuota.ts — daily generation quota Durable Object.
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
  tier?: string;
  cost?: number;
}): Request {
  return new Request("https://do.internal/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("DailyQuota — POST /check", () => {
  it("allows the first free request and returns remaining=0, limit=1", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const quota = new DailyQuota(state, env);

    const resp = await quota.fetch(makeCheckRequest({ tier: "free" }));
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      allowed: boolean;
      remaining: number;
      limit: number;
    };
    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(0);
    expect(body.limit).toBe(1);
  });

  it("denies the second free request", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const quota = new DailyQuota(state, env);

    // First request — allowed
    await quota.fetch(makeCheckRequest({ tier: "free" }));

    // Second request — denied
    const resp = await quota.fetch(makeCheckRequest({ tier: "free" }));
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      allowed: boolean;
      remaining: number;
      limit: number;
      resetAt?: string;
    };
    expect(body.allowed).toBe(false);
    expect(body.remaining).toBe(0);
    expect(body.limit).toBe(1);
    expect(body.resetAt).toBeDefined();
    // resetAt should be a valid ISO date string for tomorrow UTC midnight
    expect(new Date(body.resetAt!).toISOString()).toBe(body.resetAt);
  });

  it("allows up to 20 requests for pro tier", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const quota = new DailyQuota(state, env);

    for (let i = 0; i < 20; i++) {
      const resp = await quota.fetch(makeCheckRequest({ tier: "pro" }));
      const body = (await resp.json()) as { allowed: boolean; remaining: number };
      expect(body.allowed).toBe(true);
      expect(body.remaining).toBe(19 - i);
    }

    // 21st request — denied
    const resp = await quota.fetch(makeCheckRequest({ tier: "pro" }));
    const body = (await resp.json()) as { allowed: boolean };
    expect(body.allowed).toBe(false);
  });

  it("defaults to free tier when tier is missing", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const quota = new DailyQuota(state, env);

    const resp = await quota.fetch(makeCheckRequest({}));
    const body = (await resp.json()) as { limit: number };
    expect(body.limit).toBe(1);
  });

  it("defaults to free tier when tier is unknown", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const quota = new DailyQuota(state, env);

    const resp = await quota.fetch(makeCheckRequest({ tier: "enterprise" }));
    const body = (await resp.json()) as { limit: number };
    expect(body.limit).toBe(1);
  });

  it("handles custom cost parameter", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const quota = new DailyQuota(state, env);

    // Cost of 5 with pro tier (limit=20)
    const resp = await quota.fetch(makeCheckRequest({ tier: "pro", cost: 5 }));
    const body = (await resp.json()) as { allowed: boolean; remaining: number };
    expect(body.allowed).toBe(true);
    expect(body.remaining).toBe(15);
  });

  it("denies when cost would exceed remaining", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const quota = new DailyQuota(state, env);

    // Use 18 of 20 pro tokens
    await quota.fetch(makeCheckRequest({ tier: "pro", cost: 18 }));

    // Try to use 3 more — should be denied (only 2 remaining)
    const resp = await quota.fetch(makeCheckRequest({ tier: "pro", cost: 3 }));
    const body = (await resp.json()) as { allowed: boolean };
    expect(body.allowed).toBe(false);
  });

  it("resetAt points to next UTC midnight", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const quota = new DailyQuota(state, env);

    // Exhaust free tier
    await quota.fetch(makeCheckRequest({ tier: "free" }));
    const resp = await quota.fetch(makeCheckRequest({ tier: "free" }));
    const body = (await resp.json()) as { resetAt: string };

    const reset = new Date(body.resetAt);
    expect(reset.getUTCHours()).toBe(0);
    expect(reset.getUTCMinutes()).toBe(0);
    expect(reset.getUTCSeconds()).toBe(0);
    expect(reset.getUTCMilliseconds()).toBe(0);

    // Should be tomorrow
    const now = new Date();
    const expectedDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    expect(reset.getTime()).toBe(expectedDate.getTime());
  });
});

describe("DailyQuota — unknown route", () => {
  it("returns 404 for non-/check paths", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const quota = new DailyQuota(state, env);

    const resp = await quota.fetch(
      new Request("https://do.internal/unknown"),
    );
    expect(resp.status).toBe(404);
  });

  it("returns 404 for GET /check", async () => {
    const mock = makeMockStorage();
    const state = makeMockState(mock.storage);
    const env = makeMockEnv();
    const quota = new DailyQuota(state, env);

    const resp = await quota.fetch(
      new Request("https://do.internal/check"),
    );
    expect(resp.status).toBe(404);
  });
});
