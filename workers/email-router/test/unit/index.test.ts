import { describe, it, expect, vi } from "vitest";

/**
 * Unit tests for src/index.ts — Worker entry point.
 *
 * The entry point is minimal wiring: it delegates fetch to buildRouter()
 * and email to handleEmail(). We verify the re-exports and the delegation
 * structure.
 */

// We can't mock the module's internal state directly, so instead we test
// the exports and verify that the module structure is correct.

describe("Worker entry point exports", () => {
  it("re-exports AliasChannel class", async () => {
    const mod = await import("../../src/index.js");
    expect(mod.AliasChannel).toBeDefined();
    expect(typeof mod.AliasChannel).toBe("function");
  });

  it("re-exports TokenBucket class", async () => {
    const mod = await import("../../src/index.js");
    expect(mod.TokenBucket).toBeDefined();
    expect(typeof mod.TokenBucket).toBe("function");
  });

  it("re-exports DailyQuota class", async () => {
    const mod = await import("../../src/index.js");
    expect(mod.DailyQuota).toBeDefined();
    expect(typeof mod.DailyQuota).toBe("function");
  });

  it("has default export with fetch and email handlers", async () => {
    const mod = await import("../../src/index.js");
    expect(mod.default).toBeDefined();
    expect(typeof mod.default.fetch).toBe("function");
    expect(typeof mod.default.email).toBe("function");
  });

  it("default.fetch delegates to Hono app", async () => {
    const mod = await import("../../src/index.js");
    // Create a request to /health — the Hono router handles it
    const env = {
      ALIAS_KV: {},
      MSG_DO: {},
      RATE_LIMIT: {},
      DOMAIN_POOL: "test.shld.me",
      MESSAGE_TTL_MS: "600000",
      EPHEMERAL_ALIAS_TTL_SEC: "3600",
      POLL_TOKEN_TTL_SEC: "7200",
      HMAC_KEY: "test",
    };
    const resp = await mod.default.fetch(
      new Request("https://api.test/health"),
      env as never,
      {} as ExecutionContext,
    );
    expect(resp).toBeInstanceOf(Response);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
