/**
 * ios-bridge.ts — iOS Safari persistence + haptic helpers.
 *
 * MVP implementation: uses browser.storage.local (chrome.storage.local) for
 * token and alias persistence instead of native Keychain messaging.
 * safari.extension.dispatchMessage is macOS Safari App Extension API —
 * not available in iOS Safari Web Extensions.
 *
 * Haptic feedback: uses the Web Vibration API (navigator.vibrate) which
 * Safari on iOS 16+ supports. Short patterns map to UIImpactFeedbackGenerator
 * styles as closely as possible.
 *
 * Post-MVP: native Keychain bridge via browser.runtime.sendNativeMessage
 * + NSExtensionRequestHandling (skeleton in SafariExtensionHandler.swift).
 */

const TOKEN_KEY_PREFIX = "sm_token_";
const ALIASES_KEY = "sm_recent_aliases";
const MAX_RECENT_ALIASES = 3;

// Vibration durations approximating iOS haptic styles.
const HAPTIC_PATTERNS: Record<string, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 40,
  success: [10, 50, 10],
  error: [40, 30, 40],
  warning: [20, 30, 20],
  selection: 10,
};

/**
 * Trigger haptic feedback via the Web Vibration API.
 * Silently no-ops if the browser/context doesn't support vibration.
 */
export function haptic(style: string): void {
  try {
    const pattern = HAPTIC_PATTERNS[style] ?? HAPTIC_PATTERNS["medium"];
    navigator.vibrate?.(pattern as number);
  } catch {
    /* not supported — ignore */
  }
}

/** Persist a poll token to extension storage. */
export async function storeToken(aliasId: string, token: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [`${TOKEN_KEY_PREFIX}${aliasId}`]: token });
  } catch {
    /* storage unavailable in this context */
  }
}

/**
 * Load a poll token from extension storage.
 * Returns null if not found or storage unavailable.
 */
export async function loadToken(aliasId: string): Promise<string | null> {
  try {
    const key = `${TOKEN_KEY_PREFIX}${aliasId}`;
    const result = await chrome.storage.local.get(key);
    return (result[key] as string | undefined) ?? null;
  } catch {
    return null;
  }
}

/** Prepend an alias to the recent-aliases list (max 3, deduped by aliasId). */
export async function appendRecentAlias(alias: {
  aliasId: string;
  address: string;
  label?: string;
}): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(ALIASES_KEY);
    const existing = (stored[ALIASES_KEY] as typeof alias[] | undefined) ?? [];
    const deduped = existing.filter((a) => a.aliasId !== alias.aliasId);
    const next = [alias, ...deduped].slice(0, MAX_RECENT_ALIASES);
    await chrome.storage.local.set({ [ALIASES_KEY]: next });
  } catch {
    /* storage unavailable */
  }
}
