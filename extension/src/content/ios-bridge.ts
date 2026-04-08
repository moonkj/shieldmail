/**
 * ios-bridge.ts — Safari-specific native ↔ JS bridge.
 *
 * On iOS Safari, content scripts can communicate with the native extension
 * handler (SafariExtensionHandler.swift) via:
 *   safari.extension.dispatchMessage(name, userInfo)   — JS → Swift
 *   document.addEventListener("__shieldmail__", ...)   — Swift → JS
 *     (dispatched via page.dispatchMessageToScript in the Swift handler)
 *
 * This module wraps those primitives so ios-injector.ts stays clean.
 */

declare const safari: {
  extension: {
    dispatchMessage(name: string, userInfo?: Record<string, unknown>): void;
  };
};

/** True when running inside Safari iOS/iPadOS extension context. */
export function isSafariExtensionContext(): boolean {
  return typeof safari !== "undefined" && typeof safari.extension !== "undefined";
}

/**
 * Trigger native haptic feedback.
 * style: "light" | "medium" | "heavy" | "success" | "error" | "warning" | "selection"
 */
export function haptic(style: string): void {
  if (!isSafariExtensionContext()) return;
  try {
    safari.extension.dispatchMessage("haptic", { style });
  } catch {
    /* silent — not in extension context */
  }
}

/** Persist a poll token to iOS Keychain via the native handler. */
export function storeToken(aliasId: string, token: string): void {
  if (!isSafariExtensionContext()) return;
  try {
    safari.extension.dispatchMessage("storeToken", { aliasId, token });
  } catch {
    /* silent */
  }
}

/** Add an alias to the Keychain recent-aliases store (long-press menu). */
export function appendRecentAlias(alias: {
  aliasId: string;
  address: string;
  label?: string;
}): void {
  if (!isSafariExtensionContext()) return;
  try {
    safari.extension.dispatchMessage("storeAliases", { aliases: [alias] });
  } catch {
    /* silent */
  }
}

/**
 * Request a token from Keychain. The response is delivered asynchronously
 * via chrome.runtime.onMessage (Safari's dispatchMessageToScript routes
 * to the extension's runtime message channel, not CustomEvent).
 * Returns a Promise that resolves with the token or null (3s timeout).
 */
export function loadToken(aliasId: string): Promise<string | null> {
  if (!isSafariExtensionContext()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(handler);
      resolve(null);
    }, 3000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (msg: any) => {
      if (!msg || msg.name !== "tokenResult") return;
      if (msg.userInfo?.aliasId !== aliasId) return;
      clearTimeout(timeoutId);
      chrome.runtime.onMessage.removeListener(handler);
      resolve((msg.userInfo?.token as string | null) ?? null);
    };

    chrome.runtime.onMessage.addListener(handler);
    try {
      safari.extension.dispatchMessage("getToken", { aliasId });
    } catch {
      clearTimeout(timeoutId);
      chrome.runtime.onMessage.removeListener(handler);
      resolve(null);
    }
  });
}
