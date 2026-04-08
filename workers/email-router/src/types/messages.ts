/**
 * Canonical message shape stored in AliasChannel DO.
 *
 * PRIVACY: this is the *only* shape allowed to enter DO storage.
 * The whitelist in lib/sanitize.ts enforces it. Adding a field here
 * REQUIRES updating ALLOWED_KEYS in sanitize.ts.
 */
export interface StoredMessage {
  /** DO-side stable id (random) — distinct from upstream Message-ID. */
  id: string;
  /** OTP code, only when extractor confidence is sufficient. */
  otp?: string;
  /** 0..1 confidence of OTP extraction. */
  confidence?: number;
  /** Up to 3 verification links (https only, tracking params stripped). */
  verifyLinks?: string[];
  /** Server-side ms epoch at which the email was processed. */
  receivedAt: number;
}

/** Payload pushed from Email Worker into the DO over internal fetch. */
export interface DoPushPayload {
  otp?: string;
  confidence?: number;
  verifyLinks?: string[];
  receivedAt: number;
}
