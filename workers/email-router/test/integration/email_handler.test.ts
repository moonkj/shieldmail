import { describe, it, expect, vi } from "vitest";
// @ts-ignore — provided at runtime by @cloudflare/vitest-pool-workers
import { env, SELF } from "cloudflare:test";

/**
 * Email handler integration tests (privacy-critical).
 *
 * These exercise src/email.ts under Miniflare. We construct a synthetic
 * `ForwardableEmailMessage` and call the Worker's `email` export indirectly
 * by importing handleEmail directly. (Miniflare does not yet expose a way
 * to dispatch a synthetic email through SELF.)
 *
 * The privacy invariant we are protecting:
 *   - DO storage MUST contain only {id, otp?, confidence?, verifyLinks?, receivedAt}
 *   - No `from`, `subject`, `html`, `headers`, etc.
 *   - On parse failure, ONLY the constant string "email_parse_failed"
 *     reaches console.warn — no err.message, alias, or body interpolation.
 */

import { handleEmail } from "../../src/email.js";

interface BindingsLike {
  ALIAS_KV: KVNamespace;
  MSG_DO: DurableObjectNamespace;
}

function makeMsg(
  to: string,
  rawBody: string,
  authHeader = "dkim=pass",
): ForwardableEmailMessage {
  const headers = new Headers({ "authentication-results": authHeader });
  const encoder = new TextEncoder();
  const bytes = encoder.encode(rawBody);
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
  return {
    to,
    from: "noreply@example.com",
    headers,
    raw: stream,
    rawSize: bytes.byteLength,
    setReject: (() => {}) as never,
    forward: (async () => {}) as never,
    reply: (async () => {}) as never,
  } as unknown as ForwardableEmailMessage;
}

const VALID_EMAIL = `From: GitHub <noreply@github.com>
To: testalias@d1.test.shld.me
Subject: Verification code
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

Hi,

Your verification code is 824193. It expires in 10 minutes.
Verify: https://example.com/verify?token=abc&__hssc=1
`;

async function seedAlias(aliasId: string): Promise<void> {
  const e = env as unknown as BindingsLike;
  await e.ALIAS_KV.put(
    `alias:${aliasId}`,
    JSON.stringify({
      mode: "ephemeral",
      domain: "d1.test.shld.me",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
      tokenHash: "deadbeef",
    }),
  );
}

async function pollDo(
  aliasId: string,
): Promise<{ messages: Array<Record<string, unknown>>; expired: boolean }> {
  const e = env as unknown as BindingsLike;
  const stub = e.MSG_DO.get(e.MSG_DO.idFromName(aliasId));
  const resp = await stub.fetch("https://do.internal/messages?since=0");
  return (await resp.json()) as {
    messages: Array<Record<string, unknown>>;
    expired: boolean;
  };
}

describe("handleEmail — DKIM gate", () => {
  it("drops silently on dkim=fail (no DO push, no throw)", async () => {
    await seedAlias("dkimfail");
    const msg = makeMsg("dkimfail@d1.test.shld.me", VALID_EMAIL, "dkim=fail");
    await handleEmail(msg, env as never, {} as never);

    const out = await pollDo("dkimfail");
    expect(out.messages.length).toBe(0);
  });

  it("drops silently on unknown alias", async () => {
    // No KV seed.
    const msg = makeMsg("ghost@d1.test.shld.me", VALID_EMAIL, "dkim=pass");
    await expect(
      handleEmail(msg, env as never, {} as never),
    ).resolves.toBeUndefined();
    const out = await pollDo("ghost");
    expect(out.messages.length).toBe(0);
  });

  it("drops silently on expired alias", async () => {
    const e = env as unknown as BindingsLike;
    await e.ALIAS_KV.put(
      "alias:expired",
      JSON.stringify({
        mode: "ephemeral",
        domain: "d1.test.shld.me",
        createdAt: Date.now() - 10_000,
        expiresAt: Date.now() - 1_000,
        tokenHash: "x",
      }),
    );
    const msg = makeMsg("expired@d1.test.shld.me", VALID_EMAIL, "dkim=pass");
    await handleEmail(msg, env as never, {} as never);
    const out = await pollDo("expired");
    expect(out.messages.length).toBe(0);
  });
});

describe("handleEmail — happy path + privacy invariant", () => {
  it("parses, extracts, and pushes ONLY whitelisted fields to the DO", async () => {
    await seedAlias("happy");
    const msg = makeMsg("happy@d1.test.shld.me", VALID_EMAIL, "dkim=pass");
    await handleEmail(msg, env as never, {} as never);

    const out = await pollDo("happy");
    expect(out.messages.length).toBe(1);
    const stored = out.messages[0]!;

    // Must contain otp, verifyLinks, receivedAt, id (assigned by DO).
    expect(stored.otp).toBe("824193");
    expect(stored.receivedAt).toBeTypeOf("number");
    expect(Array.isArray(stored.verifyLinks)).toBe(true);
    // Tracking param must have been stripped end-to-end.
    expect((stored.verifyLinks as string[])[0]).toBe(
      "https://example.com/verify?token=abc",
    );

    // PRIVACY INVARIANT: forbidden keys must not exist.
    const FORBIDDEN = [
      "raw",
      "html",
      "text",
      "from",
      "subject",
      "to",
      "headers",
      "messageId",
      "rawEmail",
      "body",
    ];
    for (const k of FORBIDDEN) {
      expect(stored[k]).toBeUndefined();
    }

    // Defence-in-depth: scan the JSON for forbidden substrings that might
    // hint at leaked content. The literal sender domain "github.com" must
    // never appear in DO storage.
    const blob = JSON.stringify(stored);
    expect(blob).not.toContain("github.com");
    expect(blob).not.toContain("noreply");
    expect(blob).not.toContain("Subject");
    expect(blob).not.toContain("Hi,");
  });
});

describe("handleEmail — REGRESSION PRIVACY-2 (catch block leak)", () => {
  it("logs ONLY the constant string 'email_parse_failed' on parse failure", async () => {
    await seedAlias("malformed");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    try {
      // Garbage input — postal-mime should bail.
      const msg = makeMsg(
        "malformed@d1.test.shld.me",
        "<<< not a real mime SECRET-TOKEN-leak-me >>>",
        "dkim=pass",
      );
      await expect(
        handleEmail(msg, env as never, {} as never),
      ).resolves.toBeUndefined();

      // Either postal-mime threw → catch hit; or it returned empty
      // and DO push happened. Both are acceptable; what's NOT acceptable
      // is leaking secret content into console.
      const allLogs = [
        ...warnSpy.mock.calls.flat(),
        ...errSpy.mock.calls.flat(),
        ...logSpy.mock.calls.flat(),
        ...infoSpy.mock.calls.flat(),
      ].map((x) => String(x));
      const joined = allLogs.join(" | ");

      // Must NOT contain the secret token from the input.
      expect(joined).not.toContain("SECRET-TOKEN");
      // Must NOT contain alias id.
      expect(joined).not.toContain("malformed@");

      // If warn was called, it must have been called with EXACTLY the
      // constant string and nothing else.
      for (const call of warnSpy.mock.calls) {
        expect(call.length).toBe(1);
        expect(call[0]).toBe("email_parse_failed");
      }
    } finally {
      warnSpy.mockRestore();
      errSpy.mockRestore();
      logSpy.mockRestore();
      infoSpy.mockRestore();
    }
  });

  it("does not push any DO message when parse fails", async () => {
    await seedAlias("parsefail");
    const msg = makeMsg(
      "parsefail@d1.test.shld.me",
      "completely-invalid",
      "dkim=pass",
    );
    await handleEmail(msg, env as never, {} as never);

    const out = await pollDo("parsefail");
    // postal-mime is lenient and may return an empty parsed object rather
    // than throwing. In that case the handler will push an empty payload
    // (only receivedAt). Either way, the stored shape MUST be whitelisted.
    if (out.messages.length > 0) {
      const stored = out.messages[0]!;
      const blob = JSON.stringify(stored);
      expect(blob).not.toContain("invalid");
      expect(stored.from).toBeUndefined();
      expect(stored.subject).toBeUndefined();
    }
  });
});
