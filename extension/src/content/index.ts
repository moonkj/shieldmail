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

// ── OTP input field detection ──────────────────────────────────

const OTP_FIELD_HINTS = /otp|code|verify|verif|token|pin|인증|확인/i;

function findOtpInput(): HTMLInputElement | null {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"));
  for (const input of inputs) {
    if (input.type === "hidden" || input.disabled) continue;
    // Explicit autocomplete signal (highest confidence)
    const ac = (input.getAttribute("autocomplete") ?? "").toLowerCase();
    if (ac === "one-time-code") return input;
    // inputmode="numeric" + short maxLength (4-8 digits)
    const im = input.inputMode ?? (input.getAttribute("inputmode") ?? "");
    const ml = input.maxLength;
    if (im === "numeric" && ml >= 4 && ml <= 8) return input;
    // Heuristic: name/id/placeholder hint
    const hay = `${input.name} ${input.id} ${input.placeholder} ${input.getAttribute("aria-label") ?? ""}`;
    if (OTP_FIELD_HINTS.test(hay)) return input;
  }
  return null;
}

function fillOtpField(input: HTMLInputElement, otp: string): void {
  // Use the React-compatible value setter to trigger controlled components.
  const nativeSet = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, "value"
  )?.set;
  if (nativeSet) nativeSet.call(input, otp);
  else input.value = otp;
  input.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: otp }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

// ── OTP auto-fill listener ──────────────────────────────────────

function setupOtpAutoFill(): void {
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || typeof msg !== "object") return;
      // Listen for FETCH_MESSAGES_RESULT broadcast from background poller.
      if (msg.type === "FETCH_MESSAGES_RESULT" && msg.ok === true) {
        const messages = msg.messages as Array<{ otp?: string }> | undefined;
        const otp = messages?.[0]?.otp;
        if (!otp || !settings.autoCopyOtp) return;
        // Find OTP input field on the page and auto-fill.
        const field = findOtpInput();
        if (field) {
          fillOtpField(field, otp);
          if (DEBUG) console.debug("[ShieldMail] auto-filled OTP into", field);
        }
      }
    });
  } catch {
    /* chrome.runtime may not be available in all contexts */
  }
}

function main(): void {
  loadSettings();
  setupOtpAutoFill();

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

  // FORCE_INJECT receiver.
  // On iOS, Safari's dispatchMessageToScript routes to chrome.runtime.onMessage
  // with the shape: { name: "FORCE_INJECT", userInfo: {} }.
  // On macOS, background sends { type: "FORCE_INJECT" } directly.
  // We handle both shapes so the same code path works on both platforms.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const isForceInject =
      (msg as { type?: string })?.type === "FORCE_INJECT" ||
      (msg as { name?: string })?.name === "FORCE_INJECT";
    if (!isForceInject) return undefined;
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
