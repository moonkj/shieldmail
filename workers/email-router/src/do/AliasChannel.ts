import type { Env } from "../types/env.js";
import type { StoredMessage } from "../types/messages.js";
import { sanitizeDoPayload } from "../lib/sanitize.js";

/**
 * AliasChannel — one DO instance per alias id.
 *
 * Responsibilities:
 *   - Hold the (max 10 min) message buffer for an alias
 *   - Push from Email Worker (POST /push)
 *   - Polling endpoint (GET /messages?since=)
 *   - SSE endpoint (GET /stream)
 *   - WebSocket hibernation endpoint (GET /ws) — STUBBED until M4
 *   - Ack (POST /ack) wipes storage immediately
 *   - Delete (DELETE /) wipes everything
 *   - Alarm-based TTL: every push (re)arms an alarm so that 10 min after
 *     the LAST message arrived, storage is purged.
 *
 * Storage layout:
 *   "msg:<receivedAt>-<id>" → StoredMessage
 *
 * Privacy: only `sanitizeDoPayload`-cleaned payloads ever reach storage.
 */

// IMP-3: Retained as a fallback default only. The authoritative value is
// read from `env.MESSAGE_TTL_MS` in the constructor so wrangler.toml
// changes take effect without a code-level redeploy of constants.
const DEFAULT_MESSAGE_TTL_MS = 600_000; // 10 minutes — see ARCHITECTURE.md §5
const MSG_PREFIX = "msg:";

interface SseClient {
  controller: ReadableStreamDefaultController<Uint8Array>;
  encoder: TextEncoder;
}

export class AliasChannel implements DurableObject {
  private readonly state: DurableObjectState;
  // env is kept on the instance for future M4 needs (e.g. signing acks)
  // and is now actively consumed by IMP-3 for MESSAGE_TTL_MS.
  private readonly env: Env;
  // IMP-3: env-driven TTL so wrangler.toml changes take effect without
  // redeploy of constants. Parsed once in the constructor; falls back to
  // the module-level default on NaN / missing.
  private readonly messageTtlMs: number;
  private readonly sseClients = new Set<SseClient>();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    const parsed = Number.parseInt(this.env.MESSAGE_TTL_MS ?? "", 10);
    this.messageTtlMs = Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MESSAGE_TTL_MS;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "POST" && path === "/push") {
        return await this.handlePush(request);
      }
      if (request.method === "GET" && path === "/messages") {
        return await this.handlePoll(url);
      }
      if (request.method === "GET" && path === "/stream") {
        return this.handleStream();
      }
      if (request.method === "GET" && path === "/ws") {
        return this.handleWebSocket(request);
      }
      if (request.method === "POST" && path === "/ack") {
        return await this.handleAck();
      }
      if (request.method === "DELETE" && path === "/") {
        return await this.handleDelete();
      }
      return new Response("not found", { status: 404 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "internal error";
      return new Response(JSON.stringify({ error: message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  }

  // ─────────────────────────────────────────────
  // POST /push   (called by Email Worker)
  // ─────────────────────────────────────────────
  private async handlePush(request: Request): Promise<Response> {
    const raw = await request.json();
    const payload = sanitizeDoPayload(raw);

    const id = crypto.randomUUID();
    const stored: StoredMessage = {
      id,
      ...payload,
    };

    const key = `${MSG_PREFIX}${stored.receivedAt}-${id}`;
    await this.state.storage.put(key, stored);

    // Re-arm 10-minute purge alarm. Pushing a *new* alarm replaces the old one,
    // so retention is "TTL from the most recent message".
    // IMP-3: use env-driven TTL instance field instead of module constant.
    await this.state.storage.setAlarm(Date.now() + this.messageTtlMs);

    // Fan out to SSE clients.
    this.broadcastSse(stored);

    return new Response(JSON.stringify({ ok: true, id }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // ─────────────────────────────────────────────
  // GET /messages?since=<ms>  — polling
  // ─────────────────────────────────────────────
  private async handlePoll(url: URL): Promise<Response> {
    const sinceParam = url.searchParams.get("since");
    const since = sinceParam ? Number.parseInt(sinceParam, 10) : 0;
    const cleanSince = Number.isFinite(since) && since > 0 ? since : 0;

    const all = await this.state.storage.list<StoredMessage>({ prefix: MSG_PREFIX });
    const messages: StoredMessage[] = [];
    for (const value of all.values()) {
      if (value.receivedAt > cleanSince) messages.push(value);
    }
    messages.sort((a, b) => a.receivedAt - b.receivedAt);

    return new Response(
      JSON.stringify({ messages, expired: false }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  // ─────────────────────────────────────────────
  // GET /stream  — Server-Sent Events
  // ─────────────────────────────────────────────
  // TODO(MEDIUM-1/2/M4 SSE hardening): replay-dedup via Last-Event-ID and
  // reconnect-race protection are deferred to M4. Today a reconnecting
  // client may receive a buffered message it already saw, and a push that
  // arrives between `list()` and `add(client)` could be missed.
  private handleStream(): Response {
    const encoder = new TextEncoder();
    let client: SseClient | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start: async (controller) => {
        client = { controller, encoder };
        this.sseClients.add(client);

        // Send buffered messages immediately so a late connector still gets them.
        // TODO(MEDIUM-1/2/M4 SSE hardening): honour Last-Event-ID to avoid
        // re-delivering messages already acknowledged by the client.
        const all = await this.state.storage.list<StoredMessage>({ prefix: MSG_PREFIX });
        const sorted = Array.from(all.values()).sort((a, b) => a.receivedAt - b.receivedAt);
        for (const m of sorted) {
          controller.enqueue(encoder.encode(formatSse(m)));
        }
        // Initial keep-alive comment.
        controller.enqueue(encoder.encode(": connected\n\n"));
      },
      cancel: () => {
        if (client) this.sseClients.delete(client);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "connection": "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  }

  private broadcastSse(msg: StoredMessage): void {
    if (this.sseClients.size === 0) return;
    const chunk = formatSse(msg);
    for (const client of this.sseClients) {
      try {
        client.controller.enqueue(client.encoder.encode(chunk));
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  // ─────────────────────────────────────────────
  // GET /ws — WebSocket hibernation
  // ─────────────────────────────────────────────
  // Stubbed for M1 — full hibernation API lands in M4.
  private handleWebSocket(_request: Request): Response {
    // TODO(M4): wire up state.acceptWebSocket() with hibernation handlers
    //           webSocketMessage / webSocketClose / webSocketError.
    throw new Error("WS hibernation — M4");
  }

  // ─────────────────────────────────────────────
  // POST /ack  — wipe all messages now
  // ─────────────────────────────────────────────
  private async handleAck(): Promise<Response> {
    await this.state.storage.deleteAll();
    await this.state.storage.deleteAlarm();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // ─────────────────────────────────────────────
  // DELETE /  — full alias deletion (called from API DELETE /alias/:id)
  // ─────────────────────────────────────────────
  private async handleDelete(): Promise<Response> {
    await this.state.storage.deleteAll();
    await this.state.storage.deleteAlarm();
    // Close any SSE clients.
    for (const client of this.sseClients) {
      try {
        client.controller.close();
      } catch {
        // ignore
      }
    }
    this.sseClients.clear();
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // ─────────────────────────────────────────────
  // alarm() — TTL purge
  // ─────────────────────────────────────────────
  // FIX-3 [HIGH-4]: previously called deleteAll() unconditionally, which
  // could race with an in-flight handlePush that just stored a fresh
  // message — wiping it before any client ever saw it. We now sweep only
  // expired entries and re-arm based on the oldest survivor.
  async alarm(): Promise<void> {
    const now = Date.now();
    // IMP-3: use env-driven TTL instance field instead of module constant.
    const ttl = this.messageTtlMs;
    const cutoff = now - ttl;
    const all = await this.state.storage.list<StoredMessage>({ prefix: MSG_PREFIX });

    const expiredKeys: string[] = [];
    let oldestSurvivor = Number.POSITIVE_INFINITY;
    for (const [key, value] of all.entries()) {
      if (value.receivedAt <= cutoff) {
        expiredKeys.push(key);
      } else if (value.receivedAt < oldestSurvivor) {
        oldestSurvivor = value.receivedAt;
      }
    }

    if (expiredKeys.length > 0) {
      await this.state.storage.delete(expiredKeys);
    }

    const survivorCount = all.size - expiredKeys.length;
    if (survivorCount > 0 && Number.isFinite(oldestSurvivor)) {
      // Re-arm to (oldestSurvivingReceivedAt + TTL) or now+TTL, whichever is later.
      const nextAlarm = Math.max(oldestSurvivor + ttl, now + ttl);
      await this.state.storage.setAlarm(nextAlarm);
    }
    // If survivorCount === 0 we leave the alarm unset; pushes will re-arm it.

    // TODO(MEDIUM-1/2/M4 SSE hardening): SSE clients are not currently
    // tied to alarm-driven sweeps. Once we add replay-dedup and reconnect
    // race fixes in M4, revisit whether expired-only sweeps need to also
    // notify SSE clients (today they don't, which is intentional).
  }
}

function formatSse(msg: StoredMessage): string {
  // SSE: id + event + data lines, terminated by blank line.
  const data = JSON.stringify(msg);
  return `id: ${msg.id}\nevent: message\ndata: ${data}\n\n`;
}
