/**
 * Unit tests for ApiClient — fetch mocking, error mapping, timeout.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ApiClient,
  ApiError,
  RateLimitError,
  TokenRevokedError,
  NetworkError,
} from "../../src/background/api";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("ApiClient", () => {
  let client: ApiClient;
  beforeEach(() => {
    client = new ApiClient("https://api.shieldmail.test");
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("generateAlias — happy path parses response and normalizes expiresAt to ms", async () => {
    const serverExpires = 1_700_000_000; // seconds
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        aliasId: "a1",
        address: "abc@shield.test",
        expiresAt: serverExpires,
        pollToken: "tok",
      })
    );
    const rec = await client.generateAlias("ephemeral");
    expect(rec.aliasId).toBe("a1");
    expect(rec.address).toBe("abc@shield.test");
    expect(rec.pollToken).toBe("tok");
    expect(rec.expiresAt).toBe(serverExpires * 1000);
    expect(rec.mode).toBe("ephemeral");
    expect(typeof rec.createdAt).toBe("number");
  });

  it("generateAlias — 429 throws RateLimitError with retryAfterMs parsed", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 429, headers: { "retry-after": "30" } })
    );
    await expect(client.generateAlias("ephemeral")).rejects.toBeInstanceOf(RateLimitError);
  });

  it("generateAlias — 429 RateLimitError exposes retryAfterMs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 429, headers: { "retry-after": "30" } })
    );
    try {
      await client.generateAlias("ephemeral");
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).retryAfterMs).toBe(30_000);
    }
  });

  it("generateAlias — non-JSON 200 throws ApiError(invalid_json)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("not json", { status: 200, headers: { "content-type": "application/json" } })
    );
    await expect(client.generateAlias("ephemeral")).rejects.toBeInstanceOf(ApiError);
  });

  it("getMessages — 200 returns parsed messages", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, { messages: [{ id: "m1", subject: "hi" }], expired: false })
    );
    const r = await client.getMessages("a1", "tok");
    expect(r.expired).toBe(false);
    expect(r.messages).toHaveLength(1);
  });

  it("getMessages — 410 does NOT throw, returns {messages:[], expired:true}", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 410 })
    );
    const r = await client.getMessages("a1", "tok");
    expect(r.expired).toBe(true);
    expect(r.messages).toEqual([]);
  });

  it("getMessages — 401 throws TokenRevokedError (broadcast source)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 401 })
    );
    await expect(client.getMessages("a1", "tok")).rejects.toBeInstanceOf(TokenRevokedError);
  });

  it("getMessages — server-returned non-array messages is coerced to []", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, { messages: null, expired: false })
    );
    const r = await client.getMessages("a1", "tok");
    expect(r.messages).toEqual([]);
  });

  it("ackMessage — sends POST to /ack and succeeds on 204", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 204 })
    );
    await client.ackMessage("a1", "tok", "m1");
    expect(spy).toHaveBeenCalledOnce();
    const call = spy.mock.calls[0]!;
    const [url, init] = call;
    expect(String(url)).toContain("/alias/a1/ack");
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
  });

  it("network error maps to NetworkError", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("boom"));
    await expect(client.generateAlias("ephemeral")).rejects.toBeInstanceOf(NetworkError);
  });

  it("AbortError maps to NetworkError(timeout)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    await expect(client.generateAlias("ephemeral")).rejects.toMatchObject({
      name: "NetworkError",
      message: "timeout",
    });
  });

  it("deleteAlias — DELETE with token", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", { status: 204 })
    );
    await client.deleteAlias("a1", "tok");
    const [, init] = spy.mock.calls[0]!;
    expect((init as RequestInit).method).toBe("DELETE");
  });

  it("setBaseUrl strips trailing slashes", async () => {
    client.setBaseUrl("https://x.test/api///");
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, { aliasId: "a", address: "x@y", expiresAt: null, pollToken: "t" })
    );
    await client.generateAlias("ephemeral");
    expect(String(spy.mock.calls[0]![0])).toBe("https://x.test/api/alias/generate");
  });
});
