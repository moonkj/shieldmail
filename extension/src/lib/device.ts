/**
 * Device ID management.
 * Generates and persists a stable device identifier in chrome.storage.local.
 * Used to correlate subscription / usage state per device.
 */

/** In-memory fallback so content script never blocks on chrome.storage. */
let cachedDeviceId: string | null = null;

export async function getOrCreateDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;

  // Try chrome.storage with a 1s timeout — iOS Safari content scripts
  // sometimes hang on chrome.storage.local calls.
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const result = await Promise.race([
        chrome.storage.local.get("deviceId") as Promise<{ deviceId?: string }>,
        new Promise<{ deviceId?: string }>((r) => setTimeout(() => r({}), 1000)),
      ]);
      if (result.deviceId) {
        cachedDeviceId = result.deviceId;
        return cachedDeviceId;
      }
    }
  } catch {}

  const id = crypto.randomUUID();
  cachedDeviceId = id;

  // Best-effort persist.
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      void chrome.storage.local.set({ deviceId: id });
    }
  } catch {}

  return id;
}
