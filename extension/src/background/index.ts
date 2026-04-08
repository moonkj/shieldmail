// Service worker entry for ShieldMail.
// Responsibilities: init defaults, route runtime messages, handle
// keyboard command, react to settings changes, rehydrate pollers on wakeup.

import { ApiClient } from "./api.js";
import { BackgroundPoller } from "./poller.js";
import { dispatch, type HandlerDeps } from "./handlers.js";
import { getSettings, initSettingsIfAbsent } from "./storage.js";
import { registerNotificationClickHandler } from "./notify.js";
import { migrateToIndexedDb } from "./migration.js";
import { isRuntimeMessage, sendToTab } from "../lib/messaging.js";
import type { ExtRuntimeMessage } from "../lib/messaging.js";
import type { RuntimeMessage } from "../lib/types.js";
import { DEFAULT_SETTINGS } from "../lib/types.js";

const api = new ApiClient(DEFAULT_SETTINGS.apiBaseUrl);
const poller = new BackgroundPoller(api);
const deps: HandlerDeps = { api, poller };

// ── Bootstrap (runs on every SW wakeup, not just install) ─────────────
void (async () => {
  const settings = await getSettings();
  api.setBaseUrl(settings.apiBaseUrl);
  await poller.rehydrateAll();
})();

// ── onInstalled ────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  void (async () => {
    await initSettingsIfAbsent();
    // Single allowed debug line per spec.
    console.log("[shieldmail] installed", details.reason);
    // Lazy migration: move managed aliases to IndexedDB on update.
    if (details.reason === "update") {
      try { await migrateToIndexedDb(); } catch { /* non-fatal */ }
    }
  })();
});

// ── onMessage router ───────────────────────────────────────────────────
// Only these message types are handled asynchronously by background dispatch.
// Everything else (broadcasts like *_RESULT, PING/PONG, FORCE_INJECT echoes)
// must NOT hold the response channel open — return false to avoid
// "port closed before response" warnings.
const ASYNC_HANDLED = new Set<string>([
  "GENERATE_ALIAS",
  "FETCH_MESSAGES",
  "ACK_MESSAGE",
  "DELETE_ALIAS",
]);

chrome.runtime.onMessage.addListener((raw, _sender, sendResponse) => {
  if (!isRuntimeMessage(raw)) return false;
  const type = (raw as { type: string }).type;

  // Fire-and-forget: SSE active/inactive — no response needed.
  if (type === "SSE_ACTIVE" || type === "SSE_INACTIVE") {
    const msg = raw as ExtRuntimeMessage;
    const aliasId = (msg as { aliasId?: string }).aliasId;
    if (aliasId) {
      if (type === "SSE_ACTIVE") void poller.pauseForSse(aliasId);
      else void poller.resumeFromSse(aliasId);
    }
    return false;
  }

  if (!ASYNC_HANDLED.has(type)) return false;
  const msg = raw as RuntimeMessage;
  void (async () => {
    try {
      const result = await dispatch(msg, deps);
      sendResponse(result);
    } catch {
      sendResponse({ ok: false, error: "unknown" });
    }
  })();
  return true; // keep sendResponse alive (async)
});

// ── chrome.alarms dispatcher (SW-eviction-safe polling wakeups) ───────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith("sm-poll-")) return;
  const aliasId = alarm.name.slice("sm-poll-".length);
  void poller.onAlarm(aliasId);
});

// ── Keyboard command ───────────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command !== "shieldmail-generate") return;
  void (async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    await sendToTab(tab.id, { type: "FORCE_INJECT" });
  })();
});

// ── Storage change watcher (apiBaseUrl hot-swap) ──────────────────────
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const s = changes["settings"];
  if (!s) return;
  const next = s.newValue as { apiBaseUrl?: string } | undefined;
  if (next?.apiBaseUrl) api.setBaseUrl(next.apiBaseUrl);
});

registerNotificationClickHandler();
