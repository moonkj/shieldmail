import { Hono } from "hono";
import type { Context } from "hono";
import type { Env, AliasRecord } from "./types/env.js";
import { generateAliasId, pickDomain, fullAddress } from "./lib/alias.js";
import { signPollToken, verifyPollToken, hashTokenForStorage } from "./lib/jwt.js";

/**
 * Hono router for the public API.
 *
 * Endpoints (per ARCHITECTURE.md §7):
 *   POST   /alias/generate
 *   GET    /alias/:id/messages?since=<ts>     [Bearer pollToken]
 *   GET    /alias/:id/stream                  [Bearer pollToken]
 *   GET    /alias/:id/ws                      [Bearer pollToken]   ← stub
 *   POST   /alias/:id/ack                     [Bearer pollToken]
 *   DELETE /alias/:id                         [Bearer pollToken]
 *
 * Errors (canonical):
 *   401  bad/missing/expired token
 *   404  unknown alias
 *   410  alias expired (ephemeral past expiresAt)
 *   429  rate limited (TokenBucket DO)
 */

interface RouterCtx {
  Bindings: Env;
}

export function buildRouter(): Hono<RouterCtx> {
  const app = new Hono<RouterCtx>();

  // ──────────────────────────────────────────
  // POST /alias/generate
  // ──────────────────────────────────────────
  app.post("/alias/generate", async (c) => {
    const env = c.env;

    // Rate-limit by client IP. Stub implementation: TokenBucket DO.
    const clientIp =
      c.req.header("cf-connecting-ip") ??
      c.req.header("x-forwarded-for") ??
      "unknown";
    const rlOk = await checkRateLimit(env, `gen:${clientIp}`, {
      capacity: 30,
      refillPerSec: 0.5,
    });
    if (!rlOk.allowed) {
      // MEDIUM-3: cost > capacity is a 400, not a 429.
      if ("error" in rlOk) {
        return c.json({ error: rlOk.error }, 400);
      }
      return c.json(
        { error: "rate_limited", retryAfterMs: rlOk.retryAfterMs },
        429,
      );
    }

    let body: { mode?: unknown; ttlSec?: unknown; label?: unknown } = {};
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      // empty body is fine; defaults applied below.
    }

    const mode: "ephemeral" | "managed" =
      body.mode === "managed" ? "managed" : "ephemeral";

    // FIX-5 [MEDIUM-5]: Cloudflare KV `expirationTtl` has a hard 60s floor.
    // Clamp [60, 86400] with a 3600s default (ARCHITECTURE.md §1 D4).
    const requestedTtlSec =
      typeof body.ttlSec === "number" && body.ttlSec > 0
        ? Math.floor(body.ttlSec)
        : Number.parseInt(env.EPHEMERAL_ALIAS_TTL_SEC, 10) || 3600;
    const ephemeralTtlSec = Math.max(60, Math.min(86_400, requestedTtlSec));

    // FIX-4 [MEDIUM-4]: empty-string label must NOT pass validation.
    // Require 1..64 chars when present; otherwise treat as undefined.
    const label =
      typeof body.label === "string" &&
      body.label.length > 0 &&
      body.label.length <= 64
        ? body.label
        : undefined;

    const aliasId = generateAliasId();
    const domain = pickDomain(env.DOMAIN_POOL);
    const address = fullAddress(aliasId, domain);
    const now = Date.now();
    const expiresAt = mode === "ephemeral" ? now + ephemeralTtlSec * 1000 : null;

    // Issue pollToken: short JWT { aliasId, exp }, HS256.
    const tokenTtlSec =
      Number.parseInt(env.POLL_TOKEN_TTL_SEC, 10) || 7200;
    const tokenExpSec = Math.floor(now / 1000) + tokenTtlSec;
    const pollToken = await signPollToken(
      { aliasId, exp: tokenExpSec },
      env.HMAC_KEY,
    );
    const tokenHash = await hashTokenForStorage(pollToken);

    const record: AliasRecord = {
      mode,
      domain,
      createdAt: now,
      expiresAt,
      tokenHash,
      ...(label ? { label } : {}),
    };

    if (mode === "ephemeral") {
      await env.ALIAS_KV.put(`alias:${aliasId}`, JSON.stringify(record), {
        expirationTtl: ephemeralTtlSec,
      });
    } else {
      await env.ALIAS_KV.put(`alias:${aliasId}`, JSON.stringify(record));
    }

    return c.json({
      aliasId,
      address,
      expiresAt: expiresAt !== null ? Math.floor(expiresAt / 1000) : null,
      pollToken,
    });
  });

  // ──────────────────────────────────────────
  // Auth helper for /alias/:id/* endpoints
  // ──────────────────────────────────────────
  async function authenticate(
    c: Context<RouterCtx, string>,
  ): Promise<
    | { ok: true; record: AliasRecord; aliasId: string }
    | { ok: false; status: 401 | 404 | 410; error: string }
  > {
    const aliasId = c.req.param("id");
    if (!aliasId) return { ok: false, status: 404, error: "unknown_alias" };

    const auth = c.req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m || !m[1]) return { ok: false, status: 401, error: "missing_token" };
    const token = m[1];

    try {
      const claims = await verifyPollToken(token, c.env.HMAC_KEY);
      if (claims.aliasId !== aliasId) {
        return { ok: false, status: 401, error: "alias_mismatch" };
      }
    } catch {
      return { ok: false, status: 401, error: "bad_token" };
    }

    const record = await c.env.ALIAS_KV.get<AliasRecord>(
      `alias:${aliasId}`,
      "json",
    );
    if (!record) return { ok: false, status: 404, error: "unknown_alias" };

    if (record.expiresAt !== null && record.expiresAt < Date.now()) {
      return { ok: false, status: 410, error: "alias_expired" };
    }

    // Token rotation guard.
    const tokenHash = await hashTokenForStorage(token);
    if (tokenHash !== record.tokenHash) {
      return { ok: false, status: 401, error: "token_revoked" };
    }

    return { ok: true, record, aliasId };
  }

  // ──────────────────────────────────────────
  // GET /alias/:id/messages?since=<ms>
  // ──────────────────────────────────────────
  app.get("/alias/:id/messages", async (c) => {
    const auth = await authenticate(c);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);

    const since = c.req.query("since") ?? "0";
    const stub = c.env.MSG_DO.get(c.env.MSG_DO.idFromName(auth.aliasId));
    const url = `https://do.internal/messages?since=${encodeURIComponent(since)}`;
    const resp = await stub.fetch(url);
    return new Response(resp.body, {
      status: resp.status,
      headers: { "content-type": "application/json" },
    });
  });

  // ──────────────────────────────────────────
  // GET /alias/:id/stream  (SSE)
  // ──────────────────────────────────────────
  app.get("/alias/:id/stream", async (c) => {
    const auth = await authenticate(c);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);

    const stub = c.env.MSG_DO.get(c.env.MSG_DO.idFromName(auth.aliasId));
    const resp = await stub.fetch("https://do.internal/stream");
    return new Response(resp.body, {
      status: resp.status,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  });

  // ──────────────────────────────────────────
  // GET /alias/:id/ws  — WebSocket hibernation (M4)
  // ──────────────────────────────────────────
  app.get("/alias/:id/ws", async (c) => {
    const auth = await authenticate(c);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);
    // Stubbed: forwards to DO which throws "WS hibernation — M4".
    const stub = c.env.MSG_DO.get(c.env.MSG_DO.idFromName(auth.aliasId));
    return stub.fetch("https://do.internal/ws", {
      headers: c.req.raw.headers,
    });
  });

  // ──────────────────────────────────────────
  // POST /alias/:id/ack
  // ──────────────────────────────────────────
  app.post("/alias/:id/ack", async (c) => {
    const auth = await authenticate(c);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);

    const stub = c.env.MSG_DO.get(c.env.MSG_DO.idFromName(auth.aliasId));
    const resp = await stub.fetch("https://do.internal/ack", { method: "POST" });
    return new Response(resp.body, {
      status: resp.status,
      headers: { "content-type": "application/json" },
    });
  });

  // ──────────────────────────────────────────
  // DELETE /alias/:id
  // ──────────────────────────────────────────
  app.delete("/alias/:id", async (c) => {
    const auth = await authenticate(c);
    if (!auth.ok) return c.json({ error: auth.error }, auth.status);

    const stub = c.env.MSG_DO.get(c.env.MSG_DO.idFromName(auth.aliasId));
    await stub.fetch("https://do.internal/", { method: "DELETE" });
    await c.env.ALIAS_KV.delete(`alias:${auth.aliasId}`);

    return c.json({ ok: true });
  });

  // Health.
  app.get("/health", (c) => c.json({ ok: true, service: "shieldmail-email-router" }));

  return app;
}

// ─────────────────────────────────────────────
// Rate limit helper
// ─────────────────────────────────────────────
async function checkRateLimit(
  env: Env,
  key: string,
  opts: { capacity: number; refillPerSec: number; cost?: number },
): Promise<
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number }
  | { allowed: false; error: "cost_exceeds_capacity" }
> {
  // MEDIUM-3 guard: a cost greater than capacity can never succeed and would
  // otherwise loop forever. Reject up-front so callers can return 400.
  const cost = opts.cost ?? 1;
  if (cost > opts.capacity) {
    return { allowed: false, error: "cost_exceeds_capacity" };
  }
  const id = env.RATE_LIMIT.idFromName(key);
  const stub = env.RATE_LIMIT.get(id);
  const resp = await stub.fetch("https://do.internal/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(opts),
  });
  return (await resp.json()) as
    | { allowed: true; remaining: number }
    | { allowed: false; retryAfterMs: number };
}
