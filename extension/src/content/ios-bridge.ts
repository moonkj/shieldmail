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
 * via a "__shieldmail__tokenResult" custom event.
 * Returns a Promise that resolves with the token or null (1s timeout).
 */
export function loadToken(aliasId: string): Promise<string | null> {
  if (!isSafariExtensionContext()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      document.removeEventListener("__shieldmail__tokenResult", handler);
      resolve(null);
    }, 1000);

    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ aliasId: string; token: string | null }>).detail;
      if (detail.aliasId !== aliasId) return;
      clearTimeout(timeoutId);
      document.removeEventListener("__shieldmail__tokenResult", handler);
      resolve(detail.token);
    };

    document.addEventListener("__shieldmail__tokenResult", handler);
    try {
      safari.extension.dispatchMessage("getToken", { aliasId });
    } catch {
      clearTimeout(timeoutId);
      resolve(null);
    }
  });
}
