import { describe, it, expect } from "vitest";
// @ts-ignore — provided at runtime by @cloudflare/vitest-pool-workers
import { SELF } from "cloudflare:test";

/**
 * Router (Hono) integration tests via SELF.fetch().
 *
 * Covers ARCHITECTURE.md §7 endpoints:
 *   POST /alias/generate
 *   GET  /alias/:id/messages
 *   POST /alias/:id/ack
 *   DELETE /alias/:id
 * Plus health and rate limit.
 */

interface GenerateResponse {
  aliasId: string;
  address: string;
  expiresAt: number | null;
  pollToken: string;
}

async function generate(
  body: unknown = {},
  headers: Record<string, string> = {},
): Promise<{ status: number; data: GenerateResponse | { error: string } }> {
  const resp = await SELF.fetch("https://api.test/alias/generate", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { status: resp.status, data: (await resp.json()) as GenerateResponse | { error: string } };
}

describe("GET /health", () => {
  it("returns ok", async () => {
    const resp = await SELF.fetch("https://api.test/health");
    expect(resp.status).toBe(200);
    const j = (await resp.json()) as { ok: boolean };
    expect(j.ok).toBe(true);
  });
});

describe("POST /alias/generate", () => {
  it("happy path returns aliasId, address, expiresAt, pollToken", async () => {
    const { status, data } = await generate(
      { mode: "ephemeral", ttlSec: 3600 },
      { "cf-connecting-ip": "10.0.0.1" },
    );
    expect(status).toBe(200);
    const ok = data as GenerateResponse;
    expect(ok.aliasId).toMatch(/^[0-9a-f]{10}$/);
    expect(ok.address).toMatch(/^[0-9a-f]{10}@d[12]\.test\.shld\.me$/);
    expect(typeof ok.pollToken).toBe("string");
    expect(ok.pollToken.split(".").length).toBe(3);
    expect(typeof ok.expiresAt).toBe("number");
  });

  it("managed mode returns expiresAt: null", async () => {
    const { status, data } = await generate(
      { mode: "managed" },
      { "cf-connecting-ip": "10.0.0.2" },
    );
    expect(status).toBe(200);
    const ok = data as GenerateResponse;
    expect(ok.expiresAt).toBeNull();
  });

  it("invalid (empty/garbage) JSON body still defaults to ephemeral", async () => {
    // Empty body branch in router: try/catch around JSON parse → defaults.
    const resp = await SELF.fetch("https://api.test/alias/generate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": "10.0.0.3",
      },
      body: "this is not json",
    });
    expect(resp.status).toBe(200);
    const j = (await resp.json()) as GenerateResponse;
    expect(j.aliasId).toMatch(/^[0-9a-f]{10}$/);
  });
});

describe("GET /alias/:id/messages — auth", () => {
  it("returns 401 when Authorization header missing", async () => {
    const resp = await SELF.fetch(
      "https://api.test/alias/abcdef0123/messages",
    );
    expect(resp.status).toBe(401);
  });

  it("returns 401 when Bearer token is malformed", async () => {
    const resp = await SELF.fetch(
      "https://api.test/alias/abcdef0123/messages",
      { headers: { authorization: "Bearer not-a-jwt" } },
    );
    expect(resp.status).toBe(401);
  });

  it("returns 404 for unknown alias even with a valid-shaped token", async () => {
    // Generate an alias, get a token, then DELETE it. The token is still
    // signature-valid but the KV record is gone.
    const { data } = await generate(
      { mode: "ephemeral" },
      { "cf-connecting-ip": "10.0.0.4" },
    );
    const ok = data as GenerateResponse;
    const delResp = await SELF.fetch(`https://api.test/alias/${ok.aliasId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${ok.pollToken}` },
    });
    expect(delResp.status).toBe(200);

    const after = await SELF.fetch(
      `https://api.test/alias/${ok.aliasId}/messages`,
      { headers: { authorization: `Bearer ${ok.pollToken}` } },
    );
    expect(after.status).toBe(404);
  });

  it("returns 200 + empty messages on a freshly generated alias", async () => {
    const { data } = await generate(
      { mode: "ephemeral" },
      { "cf-connecting-ip": "10.0.0.5" },
    );
    const ok = data as GenerateResponse;
    const resp = await SELF.fetch(
      `https://api.test/alias/${ok.aliasId}/messages`,
      { headers: { authorization: `Bearer ${ok.pollToken}` } },
    );
    expect(resp.status).toBe(200);
    const j = (await resp.json()) as { messages: unknown[]; expired: boolean };
    expect(Array.isArray(j.messages)).toBe(true);
    expect(j.messages.length).toBe(0);
  });
});

describe("POST /alias/:id/ack", () => {
  it("ack succeeds with a valid token", async () => {
    const { data } = await generate(
      { mode: "ephemeral" },
      { "cf-connecting-ip": "10.0.0.6" },
    );
    const ok = data as GenerateResponse;
    const resp = await SELF.fetch(`https://api.test/alias/${ok.aliasId}/ack`, {
      method: "POST",
      headers: { authorization: `Bearer ${ok.pollToken}` },
    });
    expect(resp.status).toBe(200);
  });
});

describe("DELETE /alias/:id", () => {
  it("removes the KV record and drains the DO", async () => {
    const { data } = await generate(
      { mode: "ephemeral" },
      { "cf-connecting-ip": "10.0.0.7" },
    );
    const ok = data as GenerateResponse;
    const delResp = await SELF.fetch(`https://api.test/alias/${ok.aliasId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${ok.pollToken}` },
    });
    expect(delResp.status).toBe(200);

    // KV gone → /messages now 404.
    const messagesResp = await SELF.fetch(
      `https://api.test/alias/${ok.aliasId}/messages`,
      { headers: { authorization: `Bearer ${ok.pollToken}` } },
    );
    expect(messagesResp.status).toBe(404);
  });
});

describe("Rate limiting", () => {
  it("enforces 429 after a burst of POST /alias/generate", async () => {
    // Capacity 30, refill 0.5/s — fire 50 in a tight loop from one IP.
    const ip = "10.0.0.99";
    let saw429 = false;
    let saw200 = false;
    for (let i = 0; i < 50; i++) {
      const resp = await SELF.fetch("https://api.test/alias/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": ip,
        },
        body: JSON.stringify({ mode: "ephemeral" }),
      });
      if (resp.status === 429) saw429 = true;
      if (resp.status === 200) saw200 = true;
      if (saw429 && saw200) break;
    }
    expect(saw200).toBe(true);
    expect(saw429).toBe(true);
  });
});
