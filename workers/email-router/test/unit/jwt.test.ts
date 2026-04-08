import { describe, it, expect } from "vitest";
import {
  signPollToken,
  verifyPollToken,
  hashTokenForStorage,
} from "../../src/lib/jwt.js";

/**
 * HS256 JWT — sign / verify / tamper / expiry / alg pinning.
 *
 * These tests run in node, so WebCrypto is available via globalThis.crypto
 * (Node 20+). No external HMAC implementation is allowed; we delegate
 * entirely to lib/jwt.ts and lib/hash.ts.
 */

const SECRET = "test-secret-do-not-use-in-prod";

const futureExp = (): number => Math.floor(Date.now() / 1000) + 3600;
const pastExp = (): number => Math.floor(Date.now() / 1000) - 60;

describe("JWT — sign + verify round-trip", () => {
  it("signs a token and verifies it back to the original claims", async () => {
    const claims = { aliasId: "u8af2k3", exp: futureExp() };
    const token = await signPollToken(claims, SECRET);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const verified = await verifyPollToken(token, SECRET);
    expect(verified.aliasId).toBe("u8af2k3");
    expect(verified.exp).toBe(claims.exp);
  });

  it("two consecutive signs of the same claims are deterministic", async () => {
    const claims = { aliasId: "u8af2k3", exp: 9999999999 };
    const a = await signPollToken(claims, SECRET);
    const b = await signPollToken(claims, SECRET);
    expect(a).toBe(b);
  });
});

describe("JWT — rejection paths (all → 401)", () => {
  it("rejects a tampered payload", async () => {
    const token = await signPollToken({ aliasId: "u1", exp: futureExp() }, SECRET);
    const [h, _p, s] = token.split(".");
    // Replace payload with a different aliasId.
    const tamperedPayload = btoa(
      JSON.stringify({ aliasId: "evil-alias", exp: futureExp() }),
    )
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const tampered = `${h}.${tamperedPayload}.${s}`;
    await expect(verifyPollToken(tampered, SECRET)).rejects.toThrow(
      /signature/,
    );
  });

  it("rejects a tampered signature", async () => {
    const token = await signPollToken({ aliasId: "u1", exp: futureExp() }, SECRET);
    const [h, p] = token.split(".");
    const tampered = `${h}.${p}.deadbeefdeadbeefdeadbeefdeadbeef`;
    await expect(verifyPollToken(tampered, SECRET)).rejects.toThrow(
      /signature/,
    );
  });

  it("rejects an expired token", async () => {
    const token = await signPollToken({ aliasId: "u1", exp: pastExp() }, SECRET);
    await expect(verifyPollToken(token, SECRET)).rejects.toThrow(/expired/);
  });

  it("rejects with the wrong secret", async () => {
    const token = await signPollToken({ aliasId: "u1", exp: futureExp() }, SECRET);
    await expect(
      verifyPollToken(token, "different-secret"),
    ).rejects.toThrow(/signature/);
  });

  it("rejects a malformed token (not 3 parts)", async () => {
    await expect(verifyPollToken("not.a.real.token", SECRET)).rejects.toThrow(
      /malformed/,
    );
    await expect(verifyPollToken("only.two", SECRET)).rejects.toThrow(
      /malformed/,
    );
  });

  it("rejects a token with alg=none", async () => {
    const noneHeader = btoa(JSON.stringify({ alg: "none", typ: "JWT" }))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const payload = btoa(
      JSON.stringify({ aliasId: "u1", exp: futureExp() }),
    )
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const token = `${noneHeader}.${payload}.`;
    // Either signature or alg check should reject.
    await expect(verifyPollToken(token, SECRET)).rejects.toThrow();
  });

  it("rejects a token with alg=RS256 (alg pinning)", async () => {
    // Sign normally with HS256, then swap the header to RS256.
    const real = await signPollToken({ aliasId: "u1", exp: futureExp() }, SECRET);
    const [_h, p, s] = real.split(".");
    const rsHeader = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    // Signature won't match (different header → different signing input),
    // so we expect 'bad signature' before 'bad alg'. Either is acceptable.
    await expect(
      verifyPollToken(`${rsHeader}.${p}.${s}`, SECRET),
    ).rejects.toThrow();
  });
});

describe("JWT — hashTokenForStorage", () => {
  it("returns a 64-char hex string", async () => {
    const t = await signPollToken({ aliasId: "u1", exp: futureExp() }, SECRET);
    const h = await hashTokenForStorage(t);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("two different tokens hash to different values", async () => {
    const t1 = await signPollToken({ aliasId: "u1", exp: futureExp() }, SECRET);
    const t2 = await signPollToken({ aliasId: "u2", exp: futureExp() }, SECRET);
    const h1 = await hashTokenForStorage(t1);
    const h2 = await hashTokenForStorage(t2);
    expect(h1).not.toBe(h2);
  });
});
