/**
 * Subscription state management.
 *
 * Reads subscription info from the iOS App via native messaging
 * (chrome.runtime.sendNativeMessage → SafariExtensionHandler → App Groups
 * UserDefaults). Results are cached in chrome.storage.local with a 1-hour TTL
 * to avoid redundant native round-trips.
 *
 * Graceful degradation: if native messaging is unavailable (macOS, simulator,
 * or any error), returns a free-tier fallback so the extension never crashes.
 */

import type { SubscriptionTier } from "./types.js";

export interface SubscriptionState {
  tier: SubscriptionTier;
  jws: string | null;
  expiresDate: number | null; // epoch ms
}

interface SubscriptionCache extends SubscriptionState {
  cachedAt: number; // epoch ms
}

const CACHE_KEY = "subscriptionCache";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const NATIVE_APP_ID = "me.shld.shieldmail";
const NATIVE_TIMEOUT_MS = 2000;

const FREE_FALLBACK: SubscriptionState = {
  tier: "free",
  jws: null,
  expiresDate: null,
};

/**
 * Read cached subscription state from chrome.storage.local.
 * Returns null if cache is missing or expired.
 */
async function readCache(): Promise<SubscriptionState | null> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return null;
    // 1s timeout — iOS Safari content scripts can hang on chrome.storage.
    const result = await Promise.race([
      chrome.storage.local.get(CACHE_KEY) as Promise<Record<string, unknown>>,
      new Promise<Record<string, unknown>>((r) => setTimeout(() => r({}), 1000)),
    ]);
    const cached = result[CACHE_KEY] as SubscriptionCache | undefined;
    if (!cached || !cached.cachedAt) return null;
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) return null;
    return { tier: cached.tier, jws: cached.jws, expiresDate: cached.expiresDate };
  } catch {
    return null;
  }
}

/** Write subscription state to chrome.storage.local cache. */
async function writeCache(state: SubscriptionState): Promise<void> {
  try {
    if (typeof chrome === "undefined" || !chrome.storage?.local) return;
    const entry: SubscriptionCache = { ...state, cachedAt: Date.now() };
    await chrome.storage.local.set({ [CACHE_KEY]: entry });
  } catch {
    /* storage unavailable */
  }
}

/**
 * Request subscription state from the native iOS App via sendNativeMessage.
 * Times out after NATIVE_TIMEOUT_MS to avoid blocking the UI.
 */
async function fetchFromNative(): Promise<SubscriptionState> {
  // sendNativeMessage is only available on Safari iOS with a properly
  // configured native messaging host (App Extensions).
  if (
    typeof chrome === "undefined" ||
    !chrome.runtime?.sendNativeMessage
  ) {
    return FREE_FALLBACK;
  }

  const nativePromise = new Promise<SubscriptionState>((resolve) => {
    chrome.runtime.sendNativeMessage(
      NATIVE_APP_ID,
      { action: "getSubscription" },
      (response: unknown) => {
        // Handle chrome.runtime.lastError (set when the native host is unreachable).
        if (chrome.runtime.lastError) {
          resolve(FREE_FALLBACK);
          return;
        }
        if (
          response &&
          typeof response === "object" &&
          "tier" in response
        ) {
          const r = response as { tier?: string; jws?: string; expiresDate?: number };
          const tier: SubscriptionTier =
            r.tier === "pro" ? "pro" : "free";
          resolve({
            tier,
            jws: typeof r.jws === "string" ? r.jws : null,
            expiresDate: typeof r.expiresDate === "number" ? r.expiresDate : null,
          });
        } else {
          resolve(FREE_FALLBACK);
        }
      },
    );
  });

  const timeoutPromise = new Promise<SubscriptionState>((resolve) => {
    setTimeout(() => resolve(FREE_FALLBACK), NATIVE_TIMEOUT_MS);
  });

  return Promise.race([nativePromise, timeoutPromise]);
}

/**
 * Get the current subscription state.
 *
 * Resolution order:
 * 1. chrome.storage.local cache (if fresh, < 1 hour)
 * 2. Native messaging to iOS App
 * 3. Free-tier fallback on any error
 *
 * Safe to call from content scripts, popup, or background.
 */
export async function getSubscriptionState(): Promise<SubscriptionState> {
  // 1. Check cache first.
  const cached = await readCache();
  if (cached) return cached;

  // 2. Fetch from native app.
  try {
    const state = await fetchFromNative();
    await writeCache(state);
    return state;
  } catch {
    return FREE_FALLBACK;
  }
}

/**
 * Force-refresh subscription state, bypassing cache.
 * Used when the popup mounts or the user taps "Restore purchase".
 */
export async function refreshSubscriptionState(): Promise<SubscriptionState> {
  try {
    const state = await fetchFromNative();
    await writeCache(state);
    return state;
  } catch {
    return FREE_FALLBACK;
  }
}

/**
 * Send a purchase request to the native iOS App.
 * The App is responsible for presenting the StoreKit purchase UI.
 * Falls back to opening the App via URL scheme if native messaging fails.
 */
export async function requestPurchase(): Promise<void> {
  if (
    typeof chrome !== "undefined" &&
    chrome.runtime?.sendNativeMessage
  ) {
    try {
      await new Promise<void>((resolve) => {
        chrome.runtime.sendNativeMessage(
          NATIVE_APP_ID,
          { action: "purchase" },
          () => {
            // Ignore response — purchase happens in-app.
            resolve();
          },
        );
        // Timeout: if native messaging doesn't respond, fall through.
        setTimeout(resolve, NATIVE_TIMEOUT_MS);
      });
      return;
    } catch {
      /* fall through to URL scheme */
    }
  }

  // Fallback: open the App via URL scheme.
  window.open("shieldmail://subscribe", "_blank");
}
