/**
 * Content script entry.
 * Wires: settings retrieval → observer → detector → injector → bridge.
 *
 * Platform branching:
 *  - iOS/iPadOS: IOSFloatingButtonInjector (fixed-position 56px button,
 *    keyboard-aware via visualViewport, haptic feedback via native bridge)
 *  - macOS: ShieldIconInjector (inline icon adjacent to the email field)
 *
 * Privacy guarantees:
 *  - Only score + url + origin are ever sent to background.
 *  - No form HTML, no field values (except the email field that is filled
 *    by us, and only to set it), and no page content ever leaves this file.
 */

import { DEFAULT_SETTINGS, type UserSettings } from "../lib/types";
import { ShieldIconInjector } from "./injector";
import { IOSFloatingButtonInjector } from "./ios-injector";
import { SignupObserver } from "./observer";
import { sendMessage } from "./bridge";
import { findEmailLikeInput } from "./detect/forms";

const DEBUG = false;

if (DEBUG) console.debug("[ShieldMail] content script loaded");

/** True on iPhone, iPad, and iPod touch (including iPadOS on M-series Macs). */
function isIOS(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    // iPadOS 13+ reports MacIntel but has touch support
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

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

  const getMode = () => (settings.managedModeEnabled ? "managed" : "ephemeral");

  if (isIOS()) {
    mainIOS(getMode);
  } else {
    mainMacOS(getMode);
  }
}

// ─────────────────────────── iOS path ────────────────────────────

function mainIOS(getMode: () => "managed" | "ephemeral"): void {
  // Single floating button for the page; tracks the last focused email field.
  let currentInput: HTMLInputElement | null = null;

  const iosInjector = new IOSFloatingButtonInjector({
    getMode,
    getCurrentInput: () => currentInput,
  });

  const observer = new SignupObserver({
    threshold: () => settings.detectionThreshold,
    onActivated: (_form, result) => {
      if (result.emailField) currentInput = result.emailField;
      iosInjector.show();
      void sendMessage({ type: "DETECT_RESULT", score: result.score, activated: true });
    },
    onDeactivated: () => {
      iosInjector.hide();
    },
  });

  observer.start();

  // Focus tracking: update currentInput when user taps an email field directly
  document.addEventListener("focusin", (ev) => {
    const el = ev.target;
    if (el instanceof HTMLInputElement) {
      const type = el.type.toLowerCase();
      const autocomplete = (el.getAttribute("autocomplete") ?? "").toLowerCase();
      if (
        type === "email" ||
        el.inputMode === "email" ||
        autocomplete.includes("email")
      ) {
        currentInput = el;
        iosInjector.show();
      }
    }
  }, { passive: true });

  // FORCE_INJECT receiver (keyboard shortcut on external keyboard / Siri Shortcut)
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || (msg as { type?: string }).type !== "FORCE_INJECT") return undefined;
    const field =
      currentInput ??
      findEmailLikeInput(document) ??
      document.querySelector<HTMLInputElement>(
        'input[type="email"], input[autocomplete*="email" i], input[inputmode="email"]'
      );
    if (!field) {
      sendResponse({ ok: false, reason: "no_field" });
      return false;
    }
    currentInput = field;
    iosInjector.forceGenerate();
    sendResponse({ ok: true });
    return false;
  });
}

// ─────────────────────────── macOS path ──────────────────────────

function mainMacOS(getMode: () => "managed" | "ephemeral"): void {
  const injector = new ShieldIconInjector({ getMode });

  const observer = new SignupObserver({
    threshold: () => settings.detectionThreshold,
    onActivated: (_form, result) => {
      if (!result.emailField) return;
      injector.inject(result.emailField);
      void sendMessage({ type: "DETECT_RESULT", score: result.score, activated: true });
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
    const field =
      findEmailLikeInput(document) ??
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
