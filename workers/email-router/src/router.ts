import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context } from "hono";
import type { Env, AliasRecord } from "./types/env.js";
import { generateAliasId, pickDomain, fullAddress } from "./lib/alias.js";
import { signPollToken, verifyPollToken, hashTokenForStorage } from "./lib/jwt.js";
import { verifyAppleJWS } from "./lib/apple-jws.js";

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

  // CORS: extension content scripts and popup make direct API calls
  // (chrome-extension://, safari-web-extension:// origins). Auth is
  // token-based so permissive origin is safe.
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    }),
  );

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

    let body: {
      mode?: unknown;
      ttlSec?: unknown;
      label?: unknown;
      deviceId?: unknown;
      subscriptionJWS?: unknown;
      adminSecret?: unknown;
      adminTier?: unknown;
    } = {};
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      // empty body is fine; defaults applied below.
    }

    // ── Daily quota check ─────────────────────────────
    const deviceId =
      typeof body.deviceId === "string" && body.deviceId.length > 0
        ? body.deviceId
        : undefined;
    let tier: "free" | "pro" = "free";
    // Admin override: if request includes valid adminSecret, use adminTier directly.
    const adminSecret = typeof body.adminSecret === "string" ? body.adminSecret : "";
    const adminTierReq = typeof body.adminTier === "string" ? body.adminTier : "";
    if (adminSecret.length > 0 && adminSecret === (env.ADMIN_SECRET ?? "") && (adminTierReq === "pro" || adminTierReq === "free")) {
      tier = adminTierReq;
    } else if (typeof body.subscriptionJWS === "string" && body.subscriptionJWS.length > 0) {
      // JWS signature verification only — no unsigned fallback (SEC-1 fix).
      const jwsResult = await verifyAppleJWS(body.subscriptionJWS);
      if (jwsResult.valid && jwsResult.productId === "me.shld.shieldmail.pro.monthly") {
        tier = "pro";
      }
    }
    // Free tier: always use IP to prevent deviceId spoofing.
    // Pro tier: use deviceId (verified via JWS) for cross-network consistency.
    const identifier = tier === "pro" && deviceId ? deviceId : clientIp;

    const quotaResult = await checkDailyQuota(env, identifier, tier);
    if (!quotaResult.allowed) {
      return c.json(
        {
          error: "daily_limit_exceeded",
          remaining: 0,
          limit: quotaResult.limit,
          resetAt: quotaResult.resetAt,
        },
        403,
      );
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

    const domain = pickDomain(env.DOMAIN_POOL);
    const now = Date.now();
    const expiresAt = mode === "ephemeral" ? now + ephemeralTtlSec * 1000 : null;

    const tokenTtlSec =
      Number.parseInt(env.POLL_TOKEN_TTL_SEC, 10) || 7200;
    const tokenExpSec = Math.floor(now / 1000) + tokenTtlSec;

    // O5: Collision guard — retry up to 3 times if aliasId already exists in KV.
    // With 14-char (56-bit) IDs the per-attempt collision probability is negligible
    // (<0.001% at 1M aliases), so 3 attempts reduces the failure surface to ~10^-15.
    let aliasId = "";
    let pollToken = "";
    let tokenHash = "";
    let record!: AliasRecord;
    let success = false;
    const MAX_ATTEMPTS = 3;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      aliasId = generateAliasId();
      const existing = await env.ALIAS_KV.get(`alias:${aliasId}`);
      if (existing !== null) continue; // collision — try another id

      pollToken = await signPollToken(
        { aliasId, exp: tokenExpSec },
        env.HMAC_KEY,
      );
      tokenHash = await hashTokenForStorage(pollToken);

      record = {
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
      success = true;
      break;
    }

    if (!success) {
      return c.json({ error: "alias_generation_failed" }, 503);
    }

    const address = fullAddress(aliasId, domain);
    // Track stats (fire-and-forget, non-blocking).
    const statsNow = new Date();
    const weekKey = `stats:${tier}:week:${isoWeek(statsNow)}`;
    const monthKey = `stats:${tier}:month:${statsNow.toISOString().slice(0, 7)}`;
    const totalKey = `stats:${tier}:total`;
    const statsWork = Promise.all([
      incrementKv(env, weekKey, 604800),
      incrementKv(env, monthKey, 2678400),
      incrementKv(env, totalKey),
      env.ALIAS_KV.put(`user:${tier}:${identifier}`, "1", { expirationTtl: 2678400 }),
    ]);
    try { c.executionCtx?.waitUntil(statsWork); } catch { void statsWork; }

    return c.json({
      aliasId,
      address,
      expiresAt: expiresAt !== null ? Math.floor(expiresAt / 1000) : null,
      pollToken,
      remaining: quotaResult.remaining,
      limit: quotaResult.limit,
      tier,
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

  // ──────────────────────────────────────────
  // POST /admin/auth  { secret }
  // Verify admin secret → returns { admin: true/false }
  // ──────────────────────────────────────────
  app.post("/admin/auth", async (c) => {
    const env = c.env;
    let body: { secret?: string } = {};
    try { body = await c.req.json(); } catch {}
    const valid = typeof body.secret === "string"
      && body.secret.length > 0
      && body.secret === (env.ADMIN_SECRET ?? "");
    return c.json({ admin: valid });
  });

  // ──────────────────────────────────────────
  // POST /admin/set-tier  { secret, identifier, tier }
  // Admin-only: override tier for testing. Stores in KV (24h).
  // ──────────────────────────────────────────
  app.post("/admin/set-tier", async (c) => {
    const env = c.env;
    const clientIp = c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for") ?? "unknown";
    let body: { secret?: string; identifier?: string; tier?: string } = {};
    try { body = await c.req.json(); } catch {}
    if (typeof body.secret !== "string" || body.secret !== (env.ADMIN_SECRET ?? "")) {
      return c.json({ error: "not_admin" }, 403);
    }
    const id = typeof body.identifier === "string" && body.identifier.length > 0
      ? body.identifier : clientIp;
    const newTier = body.tier === "pro" ? "pro" : "free";
    await env.ALIAS_KV.put(`admin-tier:${id}`, newTier, { expirationTtl: 86400 });
    // Also set by IP for content script requests (no deviceId).
    await env.ALIAS_KV.put(`admin-tier:${clientIp}`, newTier, { expirationTtl: 86400 });
    return c.json({ ok: true, tier: newTier });
  });

  // ──────────────────────────────────────────
  // GET /admin/stats?secret=xxx
  // Returns usage statistics for admin dashboard.
  // ──────────────────────────────────────────
  app.post("/admin/stats", async (c) => {
    const env = c.env;
    let reqBody: { secret?: string } = {};
    try { reqBody = await c.req.json(); } catch {}
    const secret = typeof reqBody.secret === "string" ? reqBody.secret : "";
    if (!secret || secret !== (env.ADMIN_SECRET ?? "")) {
      return c.json({ error: "not_admin" }, 403);
    }
    const now = new Date();
    const weekKey = isoWeek(now);
    const monthKey = now.toISOString().slice(0, 7);

    const [freeWeek, freeTotal, proMonth] = await Promise.all([
      env.ALIAS_KV.get(`stats:free:week:${weekKey}`),
      env.ALIAS_KV.get("stats:free:total"),
      env.ALIAS_KV.get(`stats:pro:month:${monthKey}`),
    ]);

    return c.json({
      freeThisWeek: Number(freeWeek ?? "0"),
      freeTotal: Number(freeTotal ?? "0"),
      proThisMonth: Number(proMonth ?? "0"),
      period: { week: weekKey, month: monthKey },
    });
  });

  // ──────────────────────────────────────────
  // POST /admin/reset-stats  { secret }
  // Admin-only: reset all usage statistics.
  // ──────────────────────────────────────────
  app.post("/admin/reset-stats", async (c) => {
    const env = c.env;
    let reqBody: { secret?: string } = {};
    try { reqBody = await c.req.json(); } catch {}
    const secret = typeof reqBody.secret === "string" ? reqBody.secret : "";
    if (!secret || secret !== (env.ADMIN_SECRET ?? "")) {
      return c.json({ error: "not_admin" }, 403);
    }
    const now = new Date();
    const weekKey = isoWeek(now);
    const monthKey = now.toISOString().slice(0, 7);
    await Promise.all([
      env.ALIAS_KV.delete(`stats:free:week:${weekKey}`),
      env.ALIAS_KV.delete("stats:free:total"),
      env.ALIAS_KV.delete(`stats:pro:month:${monthKey}`),
    ]);
    return c.json({ ok: true, reset: { week: weekKey, month: monthKey } });
  });

  // Health.
  app.get("/health", (c) => c.json({ ok: true, service: "shieldmail-email-router" }));

  return app;
}

// ─────────────────────────────────────────────
// Daily quota helper
// ─────────────────────────────────────────────

function utcDateKey(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

async function checkDailyQuota(
  env: Env,
  identifier: string,
  tier: "free" | "pro",
): Promise<
  | { allowed: true; remaining: number; limit: number }
  | { allowed: false; remaining: 0; limit: number; resetAt: string }
> {
  const dateKey = utcDateKey();
  const doId = env.DAILY_QUOTA.idFromName(`quota:${identifier}:${dateKey}`);
  const stub = env.DAILY_QUOTA.get(doId);
  const resp = await stub.fetch("https://do.internal/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tier }),
  });
  return (await resp.json()) as
    | { allowed: true; remaining: number; limit: number }
    | { allowed: false; remaining: 0; limit: number; resetAt: string };
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

// ─────────────────────────────────────────────
// Stats helpers
// ─────────────────────────────────────────────
function isoWeek(d: Date): string {
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getUTCDay() + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

async function incrementKv(env: Env, key: string, ttl?: number): Promise<void> {
  try {
    const current = Number(await env.ALIAS_KV.get(key) ?? "0");
    const opts: KVNamespacePutOptions = ttl ? { expirationTtl: ttl } : {};
    await env.ALIAS_KV.put(key, String(current + 1), opts);
  } catch {}
}
