/**
 * Device ID management.
 * Generates and persists a stable device identifier in chrome.storage.local.
 * Used to correlate subscription / usage state per device.
 */

export async function getOrCreateDeviceId(): Promise<string> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) {
    return crypto.randomUUID();
  }

  const result = (await chrome.storage.local.get("deviceId")) as {
    deviceId?: string;
  };

  if (result.deviceId) return result.deviceId;

  const id = crypto.randomUUID();
  await chrome.storage.local.set({ deviceId: id });
  return id;
}
