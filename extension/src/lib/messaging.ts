// Shared typed messaging helpers usable by content/background/popup.
// NOTE: lib/types.ts is frozen; we EXTEND the RuntimeMessage union here with
// internal-only message types (currently FORCE_INJECT issued by background →
// content when the ⌘⇧E command fires).

import type { RuntimeMessage } from "./types.js";

/** Background → content: forced injection via keyboard command. */
export interface ForceInjectMessage {
  type: "FORCE_INJECT";
}

/** Internal liveness probe (background → popup). Popup MUST register a listener
 *  that responds with `{ type: "__SHIELDMAIL_PONG__" }` so the background can
 *  decide whether to fire OS notifications on OTP arrival. */
export interface PingMessage {
  type: "__SHIELDMAIL_PING__";
}
export interface PongMessage {
  type: "__SHIELDMAIL_PONG__";
}

/**
 * Popup → background: popup has opened a direct SSE connection to the DO.
 * Background should pause its chrome.alarms poller for this alias to avoid
 * redundant polling while the popup handles real-time delivery.
 */
export interface SseActiveMessage {
  type: "SSE_ACTIVE";
  aliasId: string;
}

/**
 * Popup → background: the popup's SSE connection has been closed or failed.
 * Background should resume polling for this alias.
 */
export interface SseInactiveMessage {
  type: "SSE_INACTIVE";
  aliasId: string;
}

/** Extended union including internal messages not in the public types.ts. */
export type ExtRuntimeMessage =
  | RuntimeMessage
  | ForceInjectMessage
  | PingMessage
  | PongMessage
  | SseActiveMessage
  | SseInactiveMessage;

/** Type guard helpers. */
export function isRuntimeMessage(value: unknown): value is ExtRuntimeMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string"
  );
}

/** Typed sendMessage to runtime (popup/background listeners). */
export async function sendRuntime<T = unknown>(
  msg: ExtRuntimeMessage,
): Promise<T | undefined> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as T | undefined;
  } catch {
    // No receiver — popup closed etc. Swallow.
    return undefined;
  }
}

/** Typed sendMessage to a specific tab (content script). */
export async function sendToTab<T = unknown>(
  tabId: number,
  msg: ExtRuntimeMessage,
): Promise<T | undefined> {
  try {
    return (await chrome.tabs.sendMessage(tabId, msg)) as T | undefined;
  } catch {
    return undefined;
  }
}

/** Error code strings surfaced to popup UX. Keep in sync with handlers.ts. */
export type ErrorCode =
  | "rate_limited"
  | "token_revoked"
  | "alias_expired"
  | "network_unavailable"
  | "domain_blocked"
  | "unknown";
