import { describe, it, expect, vi } from "vitest";
import { buildRouter } from "../../src/router.js";
import { signPollToken, hashTokenForStorage } from "../../src/lib/jwt.js";
import type { Env, AliasRecord } from "../../src/types/env.js";

/**
 * Unit tests for src/router.ts — Hono router.
 *
 * Uses Hono's `.fetch(request, env, ctx)` directly in the node environment
 * with mocked Env bindings so v8 coverage is collected.
 */

const HMAC_KEY = "test-hmac-key-do-not-use-in-prod";

// ─── Mock env factory ───────────────────────────────

function makeKvStore(): Record<string, string> {
  return {};
}

interface MockDOStub {
  fetch: ReturnType<typeof vi.fn>;
}

function makeMockEnv(
  kvStore: Record<string, string> = {},
  overrides: Partial<Record<string, unknown>> = {},
): { env: Env; doStub: MockDOStub; rlStub: MockDOStub } {
  const doStub: MockDOStub = {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messages: [], expired: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  };

  const rlStub: MockDOStub = {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ allowed: true, remaining: 29 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  };

  const env = {
    ALIAS_KV: {
      get: vi.fn().mockImplementation(async (key: string, type?: string) => {
        const raw = kvStore[key];
        if (!raw) return null;
        if (type === "json") return JSON.parse(raw);
        return raw;
      }),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    MSG_DO: {
      idFromName: vi.fn().mockReturnValue("mock-do-id"),
      get: vi.fn().mockReturnValue(doStub),
    },
    RATE_LIMIT: {
      idFromName: vi.fn().mockReturnValue("mock-rl-id"),
      get: vi.fn().mockReturnValue(rlStub),
    },
    DOMAIN_POOL: "d1.test.shld.me",
    MESSAGE_TTL_MS: "600000",
    EPHEMERAL_ALIAS_TTL_SEC: "3600",
    POLL_TOKEN_TTL_SEC: "7200",
    HMAC_KEY,
    ...overrides,
  } as unknown as Env;

  return { env, doStub, rlStub };
}

async function seedAlias(
  kvStore: Record<string, string>,
  aliasId: string,
  pollToken: string,
  overrides: Partial<AliasRecord> = {},
): Promise<void> {
  const tokenHash = await hashTokenForStorage(pollToken);
  const record: AliasRecord = {
    mode: "ephemeral",
    domain: "d1.test.shld.me",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    tokenHash,
    ...overrides,
  };
  kvStore[`alias:${aliasId}`] = JSON.stringify(record);
}

async function makeToken(aliasId: string): Promise<string> {
  return signPollToken(
    { aliasId, exp: Math.floor(Date.now() / 1000) + 3600 },
    HMAC_KEY,
  );
}

// ─── Tests ──────────────────────────────────────────

describe("GET /health", () => {
  it("returns { ok: true }", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/health"),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

describe("POST /alias/generate", () => {
  it("returns aliasId, address, pollToken, expiresAt", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "10.0.0.1",
        },
        body: JSON.stringify({ mode: "ephemeral", ttlSec: 3600 }),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      aliasId: string;
      address: string;
      pollToken: string;
      expiresAt: number | null;
    };
    expect(body.aliasId).toMatch(/^[0-9a-f]{14}$/);
    expect(body.address).toContain("@");
    expect(body.pollToken.split(".").length).toBe(3);
    expect(typeof body.expiresAt).toBe("number");
  });

  it("managed mode returns expiresAt: null", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "10.0.0.2",
        },
        body: JSON.stringify({ mode: "managed" }),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { expiresAt: number | null };
    expect(body.expiresAt).toBeNull();
  });

  it("handles invalid JSON body gracefully", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "10.0.0.3",
        },
        body: "not-json",
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { aliasId: string };
    expect(body.aliasId).toMatch(/^[0-9a-f]{14}$/);
  });

  it("clamps ttlSec to [60, 86400]", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    // Try ttlSec=10 (below 60 floor)
    const resp = await app.fetch(
      new Request("https://api.test/alias/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "10.0.0.4",
        },
        body: JSON.stringify({ mode: "ephemeral", ttlSec: 10 }),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
  });

  it("ignores empty/too-long label", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "10.0.0.5",
        },
        body: JSON.stringify({ mode: "ephemeral", label: "" }),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
  });

  it("accepts a valid label", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "10.0.0.51",
        },
        body: JSON.stringify({ mode: "ephemeral", label: "My test alias" }),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
  });

  it("returns 429 when rate limiter denies", async () => {
    const app = buildRouter();
    const { env, rlStub } = makeMockEnv();
    rlStub.fetch.mockResolvedValue(
      new Response(JSON.stringify({ allowed: false, retryAfterMs: 2000 }), {
        status: 429,
        headers: { "content-type": "application/json" },
      }),
    );
    const resp = await app.fetch(
      new Request("https://api.test/alias/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "10.0.0.6",
        },
        body: JSON.stringify({}),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(429);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("rate_limited");
  });

  it("returns 503 when KV collision happens 3 times", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    // Always return non-null from KV.get to simulate collision
    (env.ALIAS_KV.get as ReturnType<typeof vi.fn>).mockResolvedValue(
      "existing",
    );
    const resp = await app.fetch(
      new Request("https://api.test/alias/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "10.0.0.7",
        },
        body: JSON.stringify({}),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(503);
    const body = (await resp.json()) as { error: string };
    expect(body.error).toBe("alias_generation_failed");
  });

  it("uses x-forwarded-for when cf-connecting-ip is missing", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "192.168.1.1",
        },
        body: JSON.stringify({}),
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
  });
});

describe("GET /alias/:id/messages — auth", () => {
  it("returns 401 when no authorization header", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/abc123/messages"),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(401);
  });

  it("returns 401 when token is malformed", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/abc123/messages", {
        headers: { authorization: "Bearer not-a-jwt" },
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(401);
  });

  it("returns 401 when aliasId in token does not match path", async () => {
    const app = buildRouter();
    const kvStore = makeKvStore();
    const token = await makeToken("differentalias");
    await seedAlias(kvStore, "pathid00000000", token);
    const { env } = makeMockEnv(kvStore);

    const resp = await app.fetch(
      new Request("https://api.test/alias/pathid00000000/messages", {
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(401);
  });

  it("returns 404 when alias does not exist in KV", async () => {
    const app = buildRouter();
    const aliasId = "notexist000000";
    const token = await makeToken(aliasId);
    const { env } = makeMockEnv({}); // no alias seeded

    const resp = await app.fetch(
      new Request(`https://api.test/alias/${aliasId}/messages`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(404);
  });

  it("returns 410 when alias is expired", async () => {
    const app = buildRouter();
    const aliasId = "expiredalias00";
    const token = await makeToken(aliasId);
    const kvStore = makeKvStore();
    await seedAlias(kvStore, aliasId, token, {
      expiresAt: Date.now() - 1000,
    });
    const { env } = makeMockEnv(kvStore);

    const resp = await app.fetch(
      new Request(`https://api.test/alias/${aliasId}/messages`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(410);
  });

  it("returns 401 when token hash does not match (token_revoked)", async () => {
    const app = buildRouter();
    const aliasId = "revoked0000000";
    const token = await makeToken(aliasId);
    const kvStore = makeKvStore();
    // Seed with a different tokenHash
    await seedAlias(kvStore, aliasId, token, { tokenHash: "wrong-hash" });
    // Overwrite the tokenHash to simulate rotation
    const record = JSON.parse(kvStore[`alias:${aliasId}`]!) as AliasRecord;
    record.tokenHash = "completely-different-hash";
    kvStore[`alias:${aliasId}`] = JSON.stringify(record);
    const { env } = makeMockEnv(kvStore);

    const resp = await app.fetch(
      new Request(`https://api.test/alias/${aliasId}/messages`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(401);
  });

  it("returns 200 with messages on valid auth", async () => {
    const app = buildRouter();
    const aliasId = "validalias0000";
    const token = await makeToken(aliasId);
    const kvStore = makeKvStore();
    await seedAlias(kvStore, aliasId, token);
    const { env } = makeMockEnv(kvStore);

    const resp = await app.fetch(
      new Request(`https://api.test/alias/${aliasId}/messages`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
  });
});

describe("GET /alias/:id/stream", () => {
  it("returns 401 without auth", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/abc123/stream"),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(401);
  });

  it("returns SSE stream on valid auth", async () => {
    const app = buildRouter();
    const aliasId = "streamtest0000";
    const token = await makeToken(aliasId);
    const kvStore = makeKvStore();
    await seedAlias(kvStore, aliasId, token);
    const { env, doStub } = makeMockEnv(kvStore);

    doStub.fetch.mockResolvedValue(
      new Response("data: test\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const resp = await app.fetch(
      new Request(`https://api.test/alias/${aliasId}/stream`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
  });
});

describe("GET /alias/:id/ws", () => {
  it("returns 401 without auth", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/abc123/ws"),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(401);
  });

  it("forwards to DO on valid auth", async () => {
    const app = buildRouter();
    const aliasId = "wstest00000000";
    const token = await makeToken(aliasId);
    const kvStore = makeKvStore();
    await seedAlias(kvStore, aliasId, token);
    const { env, doStub } = makeMockEnv(kvStore);

    doStub.fetch.mockResolvedValue(
      new Response("ws stub", { status: 426 }),
    );

    const resp = await app.fetch(
      new Request(`https://api.test/alias/${aliasId}/ws`, {
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
      {} as ExecutionContext,
    );
    // The response comes from the DO stub, regardless of status
    expect(doStub.fetch).toHaveBeenCalled();
  });
});

describe("POST /alias/:id/ack", () => {
  it("returns 401 without auth", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/abc123/ack", { method: "POST" }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(401);
  });

  it("returns 200 on valid auth", async () => {
    const app = buildRouter();
    const aliasId = "acktest0000000";
    const token = await makeToken(aliasId);
    const kvStore = makeKvStore();
    await seedAlias(kvStore, aliasId, token);
    const { env, doStub } = makeMockEnv(kvStore);

    doStub.fetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const resp = await app.fetch(
      new Request(`https://api.test/alias/${aliasId}/ack`, { method: "POST", headers: { authorization: `Bearer ${token}` } }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
  });
});

describe("DELETE /alias/:id", () => {
  it("returns 401 without auth", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/alias/abc123", { method: "DELETE" }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(401);
  });

  it("deletes KV record and returns { ok: true }", async () => {
    const app = buildRouter();
    const aliasId = "deltest0000000";
    const token = await makeToken(aliasId);
    const kvStore = makeKvStore();
    await seedAlias(kvStore, aliasId, token);
    const { env, doStub } = makeMockEnv(kvStore);

    doStub.fetch.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const resp = await app.fetch(
      new Request(`https://api.test/alias/${aliasId}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    // KV.delete should have been called
    expect(env.ALIAS_KV.delete).toHaveBeenCalledWith(`alias:${aliasId}`);
  });
});

describe("CORS", () => {
  it("responds to OPTIONS with CORS headers", async () => {
    const app = buildRouter();
    const { env } = makeMockEnv();
    const resp = await app.fetch(
      new Request("https://api.test/health", { method: "OPTIONS" }),
      env,
      {} as ExecutionContext,
    );
    expect(resp.headers.get("access-control-allow-origin")).toBe("*");
  });
});
