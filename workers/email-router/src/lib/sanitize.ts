import type { DoPushPayload } from "../types/messages.js";

/**
 * Privacy enforcement point.
 *
 * Strips any key not in the whitelist before the payload reaches DO storage.
 * This is the LAST line of defence against accidental persistence of
 * `raw|html|text|from|subject|to`. The ESLint custom rule
 * `no-persist-raw-email` is the FIRST.
 *
 * If you add a field, update both this set AND types/messages.ts.
 */
const ALLOWED_KEYS = new Set<string>([
  "otp",
  "confidence",
  "verifyLinks",
  "receivedAt",
]);

/** Forbidden keys we explicitly check for, to fail loud in dev. */
const FORBIDDEN_KEYS = new Set<string>([
  "raw",
  "html",
  "text",
  "from",
  "subject",
  "to",
  "headers",
  "messageId",
  "rawEmail",
  "body",
]);

export function sanitizeDoPayload(input: unknown): DoPushPayload {
  if (input === null || typeof input !== "object") {
    throw new Error("sanitizeDoPayload: payload must be an object");
  }
  const src = input as Record<string, unknown>;

  // Loud failure: forbidden keys are a programming error, not user input.
  for (const k of Object.keys(src)) {
    if (FORBIDDEN_KEYS.has(k)) {
      throw new Error(`sanitizeDoPayload: forbidden key "${k}" in payload`);
    }
  }

  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src)) {
    if (ALLOWED_KEYS.has(k)) {
      out[k] = src[k];
    }
  }

  // Required fields
  if (typeof out.receivedAt !== "number") {
    throw new Error("sanitizeDoPayload: receivedAt (number) is required");
  }

  // Type validation for optional fields
  if (out.otp !== undefined && typeof out.otp !== "string") {
    throw new Error("sanitizeDoPayload: otp must be string");
  }
  if (out.confidence !== undefined && typeof out.confidence !== "number") {
    throw new Error("sanitizeDoPayload: confidence must be number");
  }
  if (out.verifyLinks !== undefined) {
    if (!Array.isArray(out.verifyLinks)) {
      throw new Error("sanitizeDoPayload: verifyLinks must be array");
    }
    for (const link of out.verifyLinks) {
      if (typeof link !== "string") {
        throw new Error("sanitizeDoPayload: verifyLinks entries must be strings");
      }
    }
  }

  return out as unknown as DoPushPayload;
}
