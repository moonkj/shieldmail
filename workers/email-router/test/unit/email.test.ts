import { describe, it, expect, vi } from "vitest";
import { handleEmail } from "../../src/email.js";
import type { Env, AliasRecord } from "../../src/types/env.js";

/**
 * Unit tests for src/email.ts — handleEmail function.
 *
 * Uses mocked Env bindings (KV, DO namespace) so the test runs in the
 * normal vitest node environment and contributes to v8 coverage.
 */

// ─── Helpers ────────────────────────────────────────

function makeHeaders(authResults?: string): Headers {
  const h = new Headers();
  if (authResults) h.set("authentication-results", authResults);
  return h;
}

function makeStream(body: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(body);
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
}

function makeMsg(
  to: string,
  rawBody: string,
  authHeader?: string,
): ForwardableEmailMessage {
  return {
    to,
    from: "sender@example.com",
    headers: makeHeaders(authHeader),
    raw: makeStream(rawBody),
    rawSize: rawBody.length,
    setReject: (() => {}) as never,
    forward: (async () => {}) as never,
    reply: (async () => {}) as never,
  } as unknown as ForwardableEmailMessage;
}

function makeAlias(overrides: Partial<AliasRecord> = {}): AliasRecord {
  return {
    mode: "ephemeral",
    domain: "d1.test.shld.me",
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
    tokenHash: "deadbeef",
    ...overrides,
  };
}

interface MockDOStub {
  fetch: ReturnType<typeof vi.fn>;
}

function makeMockEnv(kvStore: Record<string, string> = {}): {
  env: Env;
  doStub: MockDOStub;
} {
  const doStub: MockDOStub = {
    fetch: vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, id: "test-id" }), {
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
      get: vi.fn().mockReturnValue({ fetch: vi.fn() }),
    },
    DOMAIN_POOL: "d1.test.shld.me",
    MESSAGE_TTL_MS: "600000",
    EPHEMERAL_ALIAS_TTL_SEC: "3600",
    POLL_TOKEN_TTL_SEC: "7200",
    HMAC_KEY: "test-hmac-key",
  } as unknown as Env;

  return { env, doStub };
}

const VALID_MIME = `From: noreply@example.com
To: testalias@d1.test.shld.me
Subject: Verify
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8

Your verification code is 824193. It expires in 10 minutes.
Verify: https://example.com/verify?token=abc
`;

const ctx = {} as ExecutionContext;

// ─── Tests ──────────────────────────────────────────

describe("handleEmail — DKIM gate", () => {
  it("drops silently when authentication-results has dkim=fail", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:dkimfail": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("dkimfail@d1.test.shld.me", VALID_MIME, "dkim=fail");
    await handleEmail(msg, env, ctx);
    // DO should never be called
    expect(doStub.fetch).not.toHaveBeenCalled();
  });

  it("proceeds when dkim=pass", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:dkimpass": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("dkimpass@d1.test.shld.me", VALID_MIME, "dkim=pass");
    await handleEmail(msg, env, ctx);
    expect(doStub.fetch).toHaveBeenCalled();
  });

  it("proceeds when authentication-results header is absent", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:noauth": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("noauth@d1.test.shld.me", VALID_MIME);
    await handleEmail(msg, env, ctx);
    expect(doStub.fetch).toHaveBeenCalled();
  });
});

describe("handleEmail — alias validity gate", () => {
  it("drops when alias not found in KV", async () => {
    const { env, doStub } = makeMockEnv({}); // no alias seeded
    const msg = makeMsg("ghost@d1.test.shld.me", VALID_MIME, "dkim=pass");
    await handleEmail(msg, env, ctx);
    expect(doStub.fetch).not.toHaveBeenCalled();
  });

  it("drops when alias is expired", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:expired": JSON.stringify(
        makeAlias({ expiresAt: Date.now() - 1000 }),
      ),
    });
    const msg = makeMsg("expired@d1.test.shld.me", VALID_MIME, "dkim=pass");
    await handleEmail(msg, env, ctx);
    expect(doStub.fetch).not.toHaveBeenCalled();
  });

  it("passes when expiresAt is null (managed mode)", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:managed": JSON.stringify(
        makeAlias({ mode: "managed", expiresAt: null }),
      ),
    });
    const msg = makeMsg("managed@d1.test.shld.me", VALID_MIME, "dkim=pass");
    await handleEmail(msg, env, ctx);
    expect(doStub.fetch).toHaveBeenCalled();
  });

  it("drops when localPart is empty (edge case)", async () => {
    const { env, doStub } = makeMockEnv({});
    const msg = makeMsg("@d1.test.shld.me", VALID_MIME, "dkim=pass");
    await handleEmail(msg, env, ctx);
    expect(doStub.fetch).not.toHaveBeenCalled();
  });
});

describe("handleEmail — happy path with DI parseEmail", () => {
  it("pushes OTP and links to DO via stub.fetch", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:happy": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("happy@d1.test.shld.me", VALID_MIME, "dkim=pass");

    // Use the DI seam: inject a parseEmail that returns known content
    await handleEmail(msg, env, ctx, {
      parseEmail: async () => ({
        text: "Your verification code is 112233. Verify: https://example.com/verify?token=xyz",
        html: undefined,
      }),
    });

    expect(doStub.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = doStub.fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://do.internal/push");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.otp).toBe("112233");
    expect(body.receivedAt).toBeTypeOf("number");
    // sanitizeDoPayload must strip forbidden keys — body should NOT have raw/html/text
    expect(body.raw).toBeUndefined();
    expect(body.html).toBeUndefined();
    expect(body.text).toBeUndefined();
  });

  it("pushes verifyLinks from HTML content", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:htmllinks": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("htmllinks@d1.test.shld.me", "dummy", "dkim=pass");

    await handleEmail(msg, env, ctx, {
      parseEmail: async () => ({
        html: '<a href="https://example.com/verify?token=abc&utm_source=email">Verify your account</a>',
        text: undefined,
      }),
    });

    expect(doStub.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (doStub.fetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.verifyLinks).toEqual(["https://example.com/verify?token=abc"]);
  });

  it("handles email with no OTP and no links (minimal payload)", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:nootp": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("nootp@d1.test.shld.me", "dummy", "dkim=pass");

    await handleEmail(msg, env, ctx, {
      parseEmail: async () => ({
        text: "Hello, this is a plain email with no codes.",
        html: undefined,
      }),
    });

    expect(doStub.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (doStub.fetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.receivedAt).toBeTypeOf("number");
    expect(body.otp).toBeUndefined();
    expect(body.verifyLinks).toBeUndefined();
  });
});

describe("handleEmail — pickBestOtp (text vs HTML)", () => {
  it("prefers the higher-confidence result between text and HTML views", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:bothviews": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("bothviews@d1.test.shld.me", "dummy", "dkim=pass");

    await handleEmail(msg, env, ctx, {
      parseEmail: async () => ({
        text: "Your verification code is 111111",
        html: "<p>Your verification code is 222222</p>",
      }),
    });

    expect(doStub.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (doStub.fetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    // Both views yield a 6-digit OTP. The one from text/plain might differ
    // from the HTML→text view. pickBestOtp should choose the higher confidence.
    expect(body.otp).toBeDefined();
    expect(typeof body.confidence).toBe("number");
  });

  it("falls back to HTML when text is empty", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:htmlonly": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("htmlonly@d1.test.shld.me", "dummy", "dkim=pass");

    await handleEmail(msg, env, ctx, {
      parseEmail: async () => ({
        text: undefined,
        html: "<p>Your verification code is 445566</p>",
      }),
    });

    expect(doStub.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (doStub.fetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.otp).toBe("445566");
  });

  it("falls back to text when HTML is empty", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:textonly": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("textonly@d1.test.shld.me", "dummy", "dkim=pass");

    await handleEmail(msg, env, ctx, {
      parseEmail: async () => ({
        text: "Your verification code is 778899",
        html: undefined,
      }),
    });

    expect(doStub.fetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      (doStub.fetch.mock.calls[0] as [string, RequestInit])[1].body as string,
    );
    expect(body.otp).toBe("778899");
  });
});

describe("handleEmail — parse failure (catch block)", () => {
  it("silently drops on parse error (no throw, no DO push)", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:parsefail": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("parsefail@d1.test.shld.me", "dummy", "dkim=pass");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await handleEmail(msg, env, ctx, {
        parseEmail: async () => {
          throw new Error("simulated parse failure");
        },
      });
      // Must not throw
      expect(doStub.fetch).not.toHaveBeenCalled();
      // Must log constant string only
      expect(warnSpy).toHaveBeenCalledWith("[email] processing_failed");
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("does not leak error details in console output", async () => {
    const { env } = makeMockEnv({
      "alias:leaktest": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("leaktest@d1.test.shld.me", "dummy", "dkim=pass");

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      await handleEmail(msg, env, ctx, {
        parseEmail: async () => {
          throw new Error("SECRET_CONTENT_SHOULD_NOT_APPEAR");
        },
      });

      const allOutput = [
        ...warnSpy.mock.calls.flat(),
        ...logSpy.mock.calls.flat(),
      ]
        .map(String)
        .join(" ");
      expect(allOutput).not.toContain("SECRET_CONTENT");
    } finally {
      warnSpy.mockRestore();
      logSpy.mockRestore();
    }
  });
});

describe("handleEmail — HTML/text truncation (O1 guard)", () => {
  it("truncates very long HTML before processing", async () => {
    const { env, doStub } = makeMockEnv({
      "alias:longhtml": JSON.stringify(makeAlias()),
    });
    const msg = makeMsg("longhtml@d1.test.shld.me", "dummy", "dkim=pass");

    // Inject a very long HTML string. The handler should truncate at MAX_HTML_CHARS (200k).
    const longHtml = "<p>Your verification code is 112233</p>" + "x".repeat(300_000);
    await handleEmail(msg, env, ctx, {
      parseEmail: async () => ({
        html: longHtml,
        text: undefined,
      }),
    });

    // Should still complete without error and push to DO
    expect(doStub.fetch).toHaveBeenCalled();
  });
});
