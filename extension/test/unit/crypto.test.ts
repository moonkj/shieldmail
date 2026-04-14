/**
 * Unit tests for lib/crypto.ts — AES-256-GCM key generation, import/export, encrypt/decrypt.
 */
import { describe, it, expect } from "vitest";
import {
  generateKey,
  exportKey,
  importKey,
  encrypt,
  decrypt,
} from "../../src/lib/crypto";

describe("generateKey()", () => {
  it("creates a CryptoKey with AES-GCM algorithm", async () => {
    const key = await generateKey();
    expect(key).toBeDefined();
    expect(key.algorithm).toMatchObject({ name: "AES-GCM" });
  });

  it("creates an extractable key", async () => {
    const key = await generateKey();
    expect(key.extractable).toBe(true);
  });

  it("key supports encrypt and decrypt", async () => {
    const key = await generateKey();
    expect(key.usages).toContain("encrypt");
    expect(key.usages).toContain("decrypt");
  });
});

describe("exportKey() / importKey()", () => {
  it("exports to JWK format with correct algorithm", async () => {
    const key = await generateKey();
    const jwk = await exportKey(key);
    expect(jwk.kty).toBe("oct");
    expect(jwk.alg).toBe("A256GCM");
  });

  it("round-trips through export → import", async () => {
    const original = await generateKey();
    const jwk = await exportKey(original);
    const imported = await importKey(jwk);
    expect(imported.algorithm).toMatchObject({ name: "AES-GCM" });
    expect(imported.extractable).toBe(true);
    expect(imported.usages).toContain("encrypt");
    expect(imported.usages).toContain("decrypt");
  });

  it("imported key can decrypt data encrypted by original", async () => {
    const key1 = await generateKey();
    const jwk = await exportKey(key1);
    const key2 = await importKey(jwk);

    const plaintext = "Hello, ShieldMail!";
    const blob = await encrypt(key1, plaintext);
    const decrypted = await decrypt(key2, blob);
    expect(decrypted).toBe(plaintext);
  });
});

describe("encrypt() / decrypt()", () => {
  it("round-trips plaintext correctly", async () => {
    const key = await generateKey();
    const plaintext = "test-otp-123456";
    const blob = await encrypt(key, plaintext);
    const result = await decrypt(key, blob);
    expect(result).toBe(plaintext);
  });

  it("output starts with a 12-byte IV", async () => {
    const key = await generateKey();
    const blob = await encrypt(key, "data");
    // blob = [12-byte IV | ciphertext + tag]
    expect(blob.byteLength).toBeGreaterThan(12);
  });

  it("encrypted output is non-deterministic (different IVs)", async () => {
    const key = await generateKey();
    const plaintext = "determinism-test";
    const blob1 = await encrypt(key, plaintext);
    const blob2 = await encrypt(key, plaintext);
    // IVs should differ, so blobs should differ
    const arr1 = Array.from(blob1);
    const arr2 = Array.from(blob2);
    expect(arr1).not.toEqual(arr2);
  });

  it("handles empty string", async () => {
    const key = await generateKey();
    const blob = await encrypt(key, "");
    const result = await decrypt(key, blob);
    expect(result).toBe("");
  });

  it("handles unicode plaintext", async () => {
    const key = await generateKey();
    const plaintext = "인증 코드: 123456 이메일";
    const blob = await encrypt(key, plaintext);
    const result = await decrypt(key, blob);
    expect(result).toBe(plaintext);
  });

  it("throws when decrypting with wrong key", async () => {
    const key1 = await generateKey();
    const key2 = await generateKey();
    const blob = await encrypt(key1, "secret");
    await expect(decrypt(key2, blob)).rejects.toThrow();
  });

  it("throws when blob is tampered", async () => {
    const key = await generateKey();
    const blob = await encrypt(key, "original");
    // Tamper with a byte in the ciphertext area
    blob[blob.length - 1] ^= 0xff;
    await expect(decrypt(key, blob)).rejects.toThrow();
  });
});
