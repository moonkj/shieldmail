/**
 * HMAC-SHA256 utilities via WebCrypto.
 *
 * Used for:
 *   - hashing pollToken before persisting in ALIAS_KV (rotation guard)
 *   - JWT HS256 signing (delegated to lib/jwt.ts which calls hmacSha256)
 */

const encoder = new TextEncoder();

// FIX(HIGH-1): rotation-safe key cache.
//
// Previously a single { cachedKey, cachedKeyMaterial } pair was used. Two
// concurrent calls during a secret rotation could race and either return
// the old key after rotation or briefly swap mid-flight, causing flaky JWT
// verification. The fix:
//   1. Cache by secret material — multiple secrets can coexist briefly
//      while in-flight verifications finish.
//   2. Cache the *Promise*, not the resolved key, so concurrent callers
//      with the same secret share a single importKey() round-trip.
//   3. The Map self-bounds (typically 1–2 entries during rotation; old
//      secret naturally drops out once no longer requested).
//   4. Hard cap to prevent unbounded growth on adversarial input.
const KEY_CACHE_MAX = 8;
const keyCache = new Map<string, Promise<CryptoKey>>();

function getKey(secret: string): Promise<CryptoKey> {
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const promise = crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  // Evict the oldest entry if at capacity (Map preserves insertion order).
  if (keyCache.size >= KEY_CACHE_MAX) {
    const oldest = keyCache.keys().next().value;
    if (oldest !== undefined) keyCache.delete(oldest);
  }
  keyCache.set(secret, promise);
  // If importKey itself rejects, evict so future calls retry.
  promise.catch(() => keyCache.delete(secret));
  return promise;
}

export async function hmacSha256(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await getKey(secret);
  return crypto.subtle.sign("HMAC", key, encoder.encode(message));
}

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const buf = await hmacSha256(secret, message);
  return bufToHex(buf);
}

export async function hmacSha256Verify(
  secret: string,
  message: string,
  expectedHex: string,
): Promise<boolean> {
  const actual = await hmacSha256Hex(secret, message);
  return constantTimeEqual(actual, expectedHex);
}

export function bufToHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const v = bytes[i] ?? 0;
    out += v.toString(16).padStart(2, "0");
  }
  return out;
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
