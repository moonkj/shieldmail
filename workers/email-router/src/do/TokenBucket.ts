import type { Env } from "../types/env.js";

/**
 * TokenBucket — basic per-key rate limiter (one DO instance per bucket key).
 *
 * Stub for M1: enough surface to wire up `RATE_LIMIT` binding from the API
 * router and reject calls over budget. Algorithm is a simple "fill at fixed
 * rate" bucket persisted in DO storage. M4 will revisit (sliding window,
 * Turnstile interplay).
 *
 * HTTP surface:
 *   POST /check  body: { capacity: number, refillPerSec: number, cost?: number }
 *     200 → { allowed: true, remaining }
 *     429 → { allowed: false, retryAfterMs }
 */

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

const STATE_KEY = "bucket:state";

export class TokenBucket implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    void this.env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/check") {
      return this.handleCheck(request);
    }
    return new Response("not found", { status: 404 });
  }

  private async handleCheck(request: Request): Promise<Response> {
    const body = (await request.json()) as Partial<{
      capacity: number;
      refillPerSec: number;
      cost: number;
    }>;
    const capacity = typeof body.capacity === "number" && body.capacity > 0 ? body.capacity : 30;
    const refillPerSec =
      typeof body.refillPerSec === "number" && body.refillPerSec > 0 ? body.refillPerSec : 1;
    const cost = typeof body.cost === "number" && body.cost > 0 ? body.cost : 1;

    const now = Date.now();
    const stored = (await this.state.storage.get<BucketState>(STATE_KEY)) ?? {
      tokens: capacity,
      lastRefillMs: now,
    };

    const elapsedSec = Math.max(0, (now - stored.lastRefillMs) / 1000);
    const refilled = Math.min(capacity, stored.tokens + elapsedSec * refillPerSec);

    if (refilled < cost) {
      const deficit = cost - refilled;
      const retryAfterMs = Math.ceil((deficit / refillPerSec) * 1000);
      // Persist refill so subsequent calls progress correctly.
      await this.state.storage.put(STATE_KEY, {
        tokens: refilled,
        lastRefillMs: now,
      });
      return new Response(
        JSON.stringify({ allowed: false, retryAfterMs }),
        { status: 429, headers: { "content-type": "application/json" } },
      );
    }

    const next: BucketState = {
      tokens: refilled - cost,
      lastRefillMs: now,
    };
    await this.state.storage.put(STATE_KEY, next);

    return new Response(
      JSON.stringify({ allowed: true, remaining: next.tokens }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
}
