import { hmacSha256, bufToHex, constantTimeEqual } from "./hash.js";

/**
 * Minimal HS256 JWT implementation using WebCrypto.
 * No external library. We only ever issue tokens with the shape
 * `{ aliasId, exp }`. Reject anything else on verify.
 */

export interface PollTokenClaims {
  aliasId: string;
  exp: number; // seconds since epoch
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function base64UrlEncode(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = enc.encode(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new Uint8Array(input);
  }
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlDecodeToString(input: string): string {
  return dec.decode(base64UrlDecode(input));
}

export async function signPollToken(
  claims: PollTokenClaims,
  secret: string,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await hmacSha256(secret, signingInput);
  const sigB64 = base64UrlEncode(sig);
  return `${signingInput}.${sigB64}`;
}

/**
 * Verify and decode. Returns claims on success, throws on any failure.
 * Caller should treat any throw as 401.
 */
export async function verifyPollToken(
  token: string,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<PollTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("jwt: malformed");
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string];

  // Verify signature
  const expectedSig = await hmacSha256(secret, `${headerB64}.${payloadB64}`);
  const expectedSigB64 = base64UrlEncode(expectedSig);
  if (!constantTimeEqual(expectedSigB64, sigB64)) {
    throw new Error("jwt: bad signature");
  }

  // Decode header & payload
  let header: unknown;
  let payload: unknown;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64));
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    throw new Error("jwt: malformed json");
  }

  if (
    !header ||
    typeof header !== "object" ||
    (header as { alg?: unknown }).alg !== "HS256"
  ) {
    throw new Error("jwt: bad alg");
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("jwt: bad payload");
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.aliasId !== "string" || typeof p.exp !== "number") {
    throw new Error("jwt: missing claims");
  }
  if (p.exp < nowSec) {
    throw new Error("jwt: expired");
  }

  return { aliasId: p.aliasId, exp: p.exp };
}

/** Hex-encoded SHA-256 of a token, for KV storage rotation guard. */
export async function hashTokenForStorage(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return bufToHex(buf);
}
