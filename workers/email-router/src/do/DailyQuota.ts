import type { Env } from "../types/env.js";

/**
 * DailyQuota — subscription-based daily alias generation limiter.
 *
 * One DO instance per `quota:{identifier}:{YYYY-MM-DD}` key. Because the
 * date is encoded in the DO ID, a new day means a new (empty) instance —
 * automatic daily reset with zero bookkeeping.
 *
 * HTTP surface:
 *   POST /check  body: { tier: "free" | "pro", cost?: number }
 *     200 → { allowed: true, remaining, limit }
 *     200 → { allowed: false, remaining: 0, limit, resetAt: "..." }
 */

const LIMITS: Record<string, number> = {
  free: 1,
  pro: 20,
};

const COUNT_KEY = "quota:count";

export class DailyQuota implements DurableObject {
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
      tier: string;
      cost: number;
    }>;

    const tier = body.tier === "pro" ? "pro" : "free";
    const limit = LIMITS[tier] ?? LIMITS["free"]!;
    const cost = typeof body.cost === "number" && body.cost > 0 ? body.cost : 1;

    const currentCount =
      (await this.state.storage.get<number>(COUNT_KEY)) ?? 0;

    if (currentCount + cost > limit) {
      // Compute next UTC midnight for resetAt.
      const now = new Date();
      const tomorrow = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + 1,
        ),
      );
      return new Response(
        JSON.stringify({
          allowed: false,
          remaining: 0,
          limit,
          resetAt: tomorrow.toISOString(),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    const newCount = currentCount + cost;
    await this.state.storage.put(COUNT_KEY, newCount);

    return new Response(
      JSON.stringify({
        allowed: true,
        remaining: limit - newCount,
        limit,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
}
