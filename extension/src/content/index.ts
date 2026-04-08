/**
 * Content script entry.
 * Wires: settings retrieval → observer → detector → injector → bridge.
 *
 * Privacy guarantees:
 *  - Only score + url + origin are ever sent to background.
 *  - No form HTML, no field values (except the email field that is filled
 *    by us, and only to set it), and no page content ever leaves this file.
 */

import { DEFAULT_SETTINGS, type UserSettings } from "../lib/types";
import { ShieldIconInjector } from "./injector";
import { SignupObserver } from "./observer";
import { sendMessage } from "./bridge";
import { findEmailLikeInput } from "./detect/forms";

const DEBUG = false;

if (DEBUG) console.debug("[ShieldMail] content script loaded");

let settings: UserSettings = { ...DEFAULT_SETTINGS };

function loadSettings(): void {
  try {
    chrome.storage?.local.get("settings", (res: { settings?: Partial<UserSettings> }) => {
      if (res?.settings) settings = { ...DEFAULT_SETTINGS, ...res.settings };
    });
    chrome.storage?.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.settings) return;
      const next = changes.settings.newValue as Partial<UserSettings> | undefined;
      if (next) settings = { ...DEFAULT_SETTINGS, ...next };
    });
  } catch {
    /* fall back to defaults */
  }
}

function main(): void {
  loadSettings();

  const injector = new ShieldIconInjector({
    getMode: () => (settings.managedModeEnabled ? "managed" : "ephemeral"),
  });

  const observer = new SignupObserver({
    threshold: () => settings.detectionThreshold,
    onActivated: (_form, result) => {
      if (!result.emailField) return;
      injector.inject(result.emailField);
      // Telemetry-lite: report only score + activation, no URL content.
      void sendMessage({
        type: "DETECT_RESULT",
        score: result.score,
        activated: true,
      });
    },
    onDeactivated: (form) => {
      const input = form.querySelector<HTMLInputElement>(
        'input[type="email"], input[autocomplete*="email" i], input[inputmode="email"]'
      );
      if (input) injector.removeFor(input);
    },
  });

  observer.start();

  // FORCE_INJECT receiver: background dispatches this on ⌘⇧E hotkey.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || (msg as { type?: string }).type !== "FORCE_INJECT") return undefined;
    const field = findEmailLikeInput(document) ??
      document.querySelector<HTMLInputElement>(
        'input[type="email"], input[autocomplete*="email" i], input[inputmode="email"]'
      );
    if (!field) {
      sendResponse({ ok: false, reason: "no_field" });
      return false;
    }
    injector.forceInjectAndGenerate(field);
    sendResponse({ ok: true });
    return false;
  });
}

main();
