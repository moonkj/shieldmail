/**
 * HMAC-SHA256 utilities via WebCrypto.
 *
 * Used for:
 *   - hashing pollToken before persisting in ALIAS_KV (rotation guard)
 *   - JWT HS256 signing (delegated to lib/jwt.ts which calls hmacSha256)
 */

const encoder = new TextEncoder();

// TODO(HIGH-1/M4 secret rotation): the cachedKey/cachedKeyMaterial pair is
// not concurrency-safe. Two simultaneous calls with a freshly rotated secret
// can race and leave the cache pointing at the older key briefly. Resolve
// alongside M4 secret rotation design (versioned key ids + atomic swap).
let cachedKey: CryptoKey | null = null;
let cachedKeyMaterial: string | null = null;

async function getKey(secret: string): Promise<CryptoKey> {
  if (cachedKey && cachedKeyMaterial === secret) return cachedKey;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  cachedKey = key;
  cachedKeyMaterial = secret;
  return key;
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
