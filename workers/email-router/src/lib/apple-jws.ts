/**
 * Apple StoreKit 2 JWS (JSON Web Signature) verification.
 *
 * Apple signs subscription transaction payloads as a JWS (compact
 * serialisation: header.payload.signature). The header contains an `x5c`
 * certificate chain. We verify:
 *
 *   1. The JWS is structurally valid (3 dot-separated parts).
 *   2. The `x5c` chain is present and its root matches the pinned
 *      Apple Root CA G3 SHA-256 fingerprint.
 *   3. The leaf certificate's public key validates the ECDSA P-256
 *      signature over `<header>.<payload>`.
 *   4. The decoded payload contains a non-expired `expiresDate`.
 *   5. The `environment` field is "Production" or "Sandbox".
 *
 * References:
 *   - https://developer.apple.com/documentation/appstoreserverapi/jwstransaction
 *   - Apple Root CA G3: https://www.apple.com/certificateauthority/
 */

const enc = new TextEncoder();

// ── Public interface ──────────────────────────────────

export interface VerifyResult {
  valid: boolean;
  productId?: string;
  expiresDate?: number; // epoch ms
  originalTransactionId?: string;
  error?: string;
}

/**
 * Apple Root CA - G3 certificate SHA-256 fingerprint.
 * This is a well-known public value that does not change. Pinning it
 * avoids a network round-trip and KV lookup on every verification.
 *
 * Fingerprint (hex, lowercase, no colons):
 * b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024
 *
 * Source: `openssl x509 -in AppleRootCA-G3.cer -inform DER -fingerprint -sha256`
 */
export const APPLE_ROOT_CA_G3_SHA256 =
  "b0b1730ecbc7ff4505142c49f1295e6eda6bcaed7e2c68c5be91b5a11001f024";

// ── Main entry point ──────────────────────────────────

export async function verifyAppleJWS(
  jws: string,
  nowMs: number = Date.now(),
): Promise<VerifyResult> {
  try {
    return await _verify(jws, nowMs);
  } catch (err) {
    // Silent fail: any unexpected error → free tier (safe default).
    return {
      valid: false,
      error: err instanceof Error ? err.message : "unknown_error",
    };
  }
}

// ── Internal implementation ───────────────────────────

async function _verify(jws: string, nowMs: number): Promise<VerifyResult> {
  // Step 1: Split into 3 parts
  const parts = jws.split(".");
  if (parts.length !== 3) {
    return { valid: false, error: "jws_malformed" };
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  // Step 2: Decode header
  let header: JWSHeader;
  try {
    header = JSON.parse(base64UrlDecodeToString(headerB64));
  } catch {
    return { valid: false, error: "header_decode_failed" };
  }

  if (header.alg !== "ES256") {
    return { valid: false, error: "unsupported_alg" };
  }
  if (!Array.isArray(header.x5c) || header.x5c.length < 3) {
    return { valid: false, error: "x5c_chain_missing" };
  }

  // Step 3: Verify root cert fingerprint
  const rootCertB64 = header.x5c[header.x5c.length - 1]!;
  const rootCertDer = base64Decode(rootCertB64);
  const rootFingerprint = await sha256Hex(rootCertDer);
  if (rootFingerprint !== APPLE_ROOT_CA_G3_SHA256) {
    return { valid: false, error: "root_cert_mismatch" };
  }

  // Step 4: Extract public key from leaf cert (x5c[0])
  const leafCertDer = base64Decode(header.x5c[0]!);
  const publicKey = await importEcPublicKeyFromCert(leafCertDer);

  // Step 5: Verify ECDSA signature
  const signatureBytes = base64UrlDecode(signatureB64);
  const sigBuf = new Uint8Array(signatureBytes).buffer as ArrayBuffer;
  const dataBuf = new Uint8Array(enc.encode(`${headerB64}.${payloadB64}`)).buffer as ArrayBuffer;

  // Apple uses IEEE P1363 (raw r||s) format for JWS ES256.
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: { name: "SHA-256" } },
    publicKey,
    sigBuf,
    dataBuf,
  );

  if (!valid) {
    return { valid: false, error: "signature_invalid" };
  }

  // Step 6: Decode payload
  let payload: JWSPayload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(payloadB64));
  } catch {
    return { valid: false, error: "payload_decode_failed" };
  }

  // Step 7: Check expiration
  if (typeof payload.expiresDate === "number" && payload.expiresDate <= nowMs) {
    return {
      valid: false,
      productId: payload.productId,
      expiresDate: payload.expiresDate,
      originalTransactionId: payload.originalTransactionId,
      error: "subscription_expired",
    };
  }

  // Step 8: Check environment
  if (
    payload.environment !== "Production" &&
    payload.environment !== "Sandbox"
  ) {
    return {
      valid: false,
      productId: payload.productId,
      error: "invalid_environment",
    };
  }

  return {
    valid: true,
    productId: payload.productId,
    expiresDate: payload.expiresDate,
    originalTransactionId: payload.originalTransactionId,
  };
}

// ── Types ─────────────────────────────────────────────

interface JWSHeader {
  alg: string;
  x5c: string[]; // base64-encoded DER certificates
}

interface JWSPayload {
  productId?: string;
  expiresDate?: number; // epoch ms
  originalTransactionId?: string;
  environment?: string;
  [key: string]: unknown;
}

// ── Helpers (exported for testing) ────────────────────

/** Standard base64 decode (non-URL-safe). Used for x5c certificates. */
export function base64Decode(input: string): Uint8Array {
  const bin = atob(input);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** base64url decode → Uint8Array */
export function base64UrlDecode(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return base64Decode(b64);
}

/** base64url decode → string (UTF-8) */
export function base64UrlDecodeToString(input: string): string {
  return new TextDecoder().decode(base64UrlDecode(input));
}

/** base64url encode from Uint8Array or ArrayBuffer */
export function base64UrlEncode(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 hex digest of a Uint8Array */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new Uint8Array(data).buffer as ArrayBuffer);
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Import an ECDSA P-256 public key from a DER-encoded X.509 certificate.
 *
 * X.509 certificates in DER are not directly importable via
 * `crypto.subtle.importKey("spki", ...)`. We need to extract the
 * SubjectPublicKeyInfo (SPKI) block from the certificate's TBSCertificate.
 *
 * Approach: Minimal ASN.1/DER parser that walks the certificate structure
 * to extract the SPKI bytes. No external ASN.1 library needed.
 */
export async function importEcPublicKeyFromCert(
  certDer: Uint8Array,
): Promise<CryptoKey> {
  const spki = extractSpkiFromCert(certDer);
  return crypto.subtle.importKey(
    "spki",
    new Uint8Array(spki).buffer as ArrayBuffer,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );
}

// ── Minimal ASN.1 DER parser ──────────────────────────

interface Asn1Element {
  tag: number;
  length: number;
  valueOffset: number;
  totalLength: number;
}

/**
 * Parse the tag + length of a DER element at the given offset.
 */
export function parseAsn1Element(data: Uint8Array, offset: number): Asn1Element {
  const tag = data[offset]!;
  let lengthByte = data[offset + 1]!;
  let valueOffset: number;
  let length: number;

  if (lengthByte < 0x80) {
    // Short form
    length = lengthByte;
    valueOffset = offset + 2;
  } else {
    // Long form
    const numBytes = lengthByte & 0x7f;
    length = 0;
    for (let i = 0; i < numBytes; i++) {
      length = (length << 8) | (data[offset + 2 + i] ?? 0);
    }
    valueOffset = offset + 2 + numBytes;
  }

  return {
    tag,
    length,
    valueOffset,
    totalLength: (valueOffset - offset) + length,
  };
}

/**
 * Iterate the children of a constructed (SEQUENCE/SET) ASN.1 element.
 */
export function* iterateAsn1Children(
  data: Uint8Array,
  parentValueOffset: number,
  parentLength: number,
): Generator<Asn1Element & { childIndex: number }> {
  let pos = parentValueOffset;
  const end = parentValueOffset + parentLength;
  let childIndex = 0;
  while (pos < end) {
    const elem = parseAsn1Element(data, pos);
    yield { ...elem, childIndex };
    pos = elem.valueOffset + elem.length;
    childIndex++;
  }
}

/**
 * Extract the SubjectPublicKeyInfo bytes from a DER X.509 certificate.
 *
 * X.509 structure:
 *   Certificate ::= SEQUENCE {
 *     tbsCertificate      TBSCertificate,        -- child 0
 *     signatureAlgorithm  AlgorithmIdentifier,   -- child 1
 *     signatureValue      BIT STRING             -- child 2
 *   }
 *
 *   TBSCertificate ::= SEQUENCE {
 *     version         [0] EXPLICIT Version DEFAULT v1,  -- child 0 (context tag 0xa0)
 *     serialNumber    CertificateSerialNumber,          -- child 1
 *     signature       AlgorithmIdentifier,              -- child 2
 *     issuer          Name,                             -- child 3
 *     validity        Validity,                         -- child 4
 *     subject         Name,                             -- child 5
 *     subjectPKInfo   SubjectPublicKeyInfo,             -- child 6
 *     ...
 *   }
 *
 * We want child 6 of TBSCertificate (when version tag [0] is present).
 * If version is absent (v1 default), SPKI is child 5.
 */
export function extractSpkiFromCert(certDer: Uint8Array): Uint8Array {
  // Parse the outer SEQUENCE (Certificate)
  const certSeq = parseAsn1Element(certDer, 0);
  if (certSeq.tag !== 0x30) throw new Error("cert: not a SEQUENCE");

  // Get TBSCertificate (first child of Certificate)
  const tbsChildren = iterateAsn1Children(certDer, certSeq.valueOffset, certSeq.length);
  const tbsElem = tbsChildren.next().value;
  if (!tbsElem || tbsElem.tag !== 0x30) throw new Error("cert: bad TBSCertificate");

  // Walk TBSCertificate children
  let spkiIndex = 6; // default: version [0] present
  const children: Asn1Element[] = [];
  for (const child of iterateAsn1Children(certDer, tbsElem.valueOffset, tbsElem.length)) {
    children.push(child);
    // If first child is NOT the version context tag [0], SPKI is at index 5
    if (child.childIndex === 0 && child.tag !== 0xa0) {
      spkiIndex = 5;
    }
  }

  const spkiElem = children[spkiIndex];
  if (!spkiElem || spkiElem.tag !== 0x30) {
    throw new Error("cert: SPKI not found");
  }

  // Return the full DER encoding of the SPKI element (tag + length + value)
  const start = spkiElem.valueOffset - (spkiElem.totalLength - spkiElem.length);
  return certDer.slice(start, start + spkiElem.totalLength);
}
