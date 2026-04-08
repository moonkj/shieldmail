import { describe, it, expect } from "vitest";
// @ts-ignore — provided at runtime by @cloudflare/vitest-pool-workers
import { env, runInDurableObject } from "cloudflare:test";
import type { AliasChannel } from "../../src/do/AliasChannel.js";

/**
 * AliasChannel DO integration tests.
 *
 * Uses `@cloudflare/vitest-pool-workers` so we get a real DO + storage +
 * alarm scheduler under Miniflare. The Worker entry is the same one that
 * ships in production (src/index.ts).
 *
 * Key invariants under test:
 *   1. push → poll round-trip preserves the whitelisted shape.
 *   2. ack wipes storage immediately.
 *   3. delete (HTTP DELETE /) wipes storage and alarm.
 *   4. **REGRESSION HIGH-4**: alarm() must purge ONLY entries older than
 *      MESSAGE_TTL_MS, never blanket-deleteAll. A push that races a fire
 *      must survive.
 */

const TTL_MS = 600_000;

interface BindingsLike {
  MSG_DO: DurableObjectNamespace;
}

function getStub(name: string): DurableObjectStub {
  const e = env as unknown as BindingsLike;
  const id = e.MSG_DO.idFromName(name);
  return e.MSG_DO.get(id);
}

async function pushMessage(
  stub: DurableObjectStub,
  payload: { otp?: string; confidence?: number; verifyLinks?: string[]; receivedAt: number },
): Promise<void> {
  const resp = await stub.fetch("https://do.internal/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  expect(resp.status).toBe(200);
}

async function pollMessages(
  stub: DurableObjectStub,
  since = 0,
): Promise<{ messages: Array<{ id: string; otp?: string; receivedAt: number }>; expired: boolean }> {
  const resp = await stub.fetch(
    `https://do.internal/messages?since=${since}`,
  );
  expect(resp.status).toBe(200);
  return (await resp.json()) as { messages: Array<{ id: string; otp?: string; receivedAt: number }>; expired: boolean };
}

describe("AliasChannel — push / poll / ack / delete", () => {
  it("push followed by poll returns the same message", async () => {
    const stub = getStub("alpha");
    const t = Date.now();
    await pushMessage(stub, {
      otp: "482913",
      confidence: 0.85,
      verifyLinks: ["https://example.com/verify"],
      receivedAt: t,
    });

    const out = await pollMessages(stub);
    expect(out.messages.length).toBe(1);
    const msg = out.messages[0]!;
    expect(msg.otp).toBe("482913");
    expect(msg.receivedAt).toBe(t);
  });

  it("push enforces the privacy whitelist (raw key → 500)", async () => {
    const stub = getStub("forbidden");
    const resp = await stub.fetch("https://do.internal/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        receivedAt: Date.now(),
        raw: "should be rejected",
      }),
    });
    // sanitize throws → DO returns 500.
    expect(resp.status).toBe(500);
    const j = (await resp.json()) as { error: string };
    expect(j.error).toMatch(/raw/);
  });

  it("ack wipes storage", async () => {
    const stub = getStub("ack-test");
    await pushMessage(stub, { receivedAt: Date.now(), otp: "111111", confidence: 0.7 });

    const before = await pollMessages(stub);
    expect(before.messages.length).toBe(1);

    const ackResp = await stub.fetch("https://do.internal/ack", { method: "POST" });
    expect(ackResp.status).toBe(200);

    const after = await pollMessages(stub);
    expect(after.messages.length).toBe(0);
  });

  it("DELETE wipes storage", async () => {
    const stub = getStub("delete-test");
    await pushMessage(stub, { receivedAt: Date.now(), otp: "222222", confidence: 0.8 });
    const delResp = await stub.fetch("https://do.internal/", { method: "DELETE" });
    expect(delResp.status).toBe(200);
    const after = await pollMessages(stub);
    expect(after.messages.length).toBe(0);
  });

  it("unknown route returns 404", async () => {
    const stub = getStub("unknown");
    const resp = await stub.fetch("https://do.internal/nope");
    expect(resp.status).toBe(404);
  });

  it("poll honours the `since` parameter", async () => {
    const stub = getStub("since-test");
    const t1 = 1_000_000;
    const t2 = 2_000_000;
    await pushMessage(stub, { receivedAt: t1, otp: "111111", confidence: 0.7 });
    await pushMessage(stub, { receivedAt: t2, otp: "222222", confidence: 0.7 });

    const all = await pollMessages(stub, 0);
    expect(all.messages.length).toBe(2);

    const recent = await pollMessages(stub, t1);
    expect(recent.messages.length).toBe(1);
    expect(recent.messages[0]!.otp).toBe("222222");
  });
});

// ─────────────────────────────────────────────────────────
// REGRESSION: HIGH-4 — alarm race with concurrent push
// ─────────────────────────────────────────────────────────
describe("AliasChannel — REGRESSION HIGH-4 (alarm race)", () => {
  it("alarm() does not wipe a freshly-arrived message that races the fire", async () => {
    const stub = getStub("alarm-race");

    // ── Step 1: push A at "t = 0" using Date.now() at test time. We use
    //    real timestamps in the payload so we can later simulate "old" vs
    //    "fresh" entries by hand-crafting receivedAt values.
    const fakeNow = Date.now();
    // Old message: receivedAt is fakeNow - TTL_MS - 1000ms (well past TTL).
    await pushMessage(stub, {
      otp: "AAAAAA",
      confidence: 0.7,
      verifyLinks: [],
      receivedAt: fakeNow - TTL_MS - 1000,
    });

    // ── Step 2: push B at "t = TTL_MS" — fresh, must survive the alarm.
    await pushMessage(stub, {
      otp: "BBBBBB",
      confidence: 0.9,
      verifyLinks: [],
      receivedAt: fakeNow,
    });

    // ── Step 3: trigger the alarm directly through the DO. We use
    //    runInDurableObject so the test can call the instance method.
    await runInDurableObject(
      stub,
      async (instance: AliasChannel) => {
        await instance.alarm();
      },
    );

    // ── Step 4: poll. B must still be present; A must be gone.
    const out = await pollMessages(stub);
    const codes = out.messages.map((m) => m.otp).filter(Boolean);
    expect(codes).toContain("BBBBBB");
    expect(codes).not.toContain("AAAAAA");
  });

  it("alarm() with no expired entries leaves storage untouched", async () => {
    const stub = getStub("alarm-no-expiry");
    const now = Date.now();
    await pushMessage(stub, {
      otp: "FRESH1",
      confidence: 0.9,
      receivedAt: now,
    });
    await pushMessage(stub, {
      otp: "FRESH2",
      confidence: 0.9,
      receivedAt: now + 1,
    });

    await runInDurableObject(stub, async (i: AliasChannel) => {
      await i.alarm();
    });

    const after = await pollMessages(stub);
    expect(after.messages.length).toBe(2);
  });

  it("alarm() with all entries expired clears storage", async () => {
    const stub = getStub("alarm-all-expired");
    const ancient = Date.now() - TTL_MS - 5_000;
    await pushMessage(stub, { otp: "OLD1", confidence: 0.9, receivedAt: ancient });
    await pushMessage(stub, {
      otp: "OLD2",
      confidence: 0.9,
      receivedAt: ancient + 100,
    });

    await runInDurableObject(stub, async (i: AliasChannel) => {
      await i.alarm();
    });

    const after = await pollMessages(stub);
    expect(after.messages.length).toBe(0);
  });
});
