// AES-256-GCM wrapper using the Web Crypto API.
// Used by Managed Mode IndexedDB to encrypt persisted message content.
// Keys are stored in chrome.storage.local as JWK (never leaves the device).

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // 96-bit IV — recommended for AES-GCM

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable — so we can export to JWK for storage
    ["encrypt", "decrypt"],
  );
}

export async function exportKey(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

export async function importKey(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: ALGORITHM, length: KEY_LENGTH },
    true,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypt `plaintext` with `key`.
 * Returns a Uint8Array of [12-byte IV | ciphertext+tag].
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuf = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded,
  );
  const result = new Uint8Array(IV_LENGTH + cipherBuf.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(cipherBuf), IV_LENGTH);
  return result;
}

/**
 * Decrypt a blob produced by `encrypt()`.
 * Throws `DOMException` on auth tag failure (tampered data).
 */
export async function decrypt(
  key: CryptoKey,
  blob: Uint8Array,
): Promise<string> {
  const iv = blob.slice(0, IV_LENGTH);
  const cipherBuf = blob.slice(IV_LENGTH);
  const plainBuf = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    cipherBuf,
  );
  return new TextDecoder().decode(plainBuf);
}
