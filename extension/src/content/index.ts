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
import { IOSFloatingButtonInjector, getLastGeneratedAlias, restorePersistedAlias, setOtpCallback, setVerifyLinkCallback } from "./ios-injector";
import { SignupObserver } from "./observer";
import { sendMessage } from "./bridge";
import { findEmailLikeInput } from "./detect/forms";

const DEBUG = false;

/** Only allow http(s) URLs to prevent javascript:/data: scheme attacks. */
export function safeOpen(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      window.open(url, "_blank", "noopener");
    }
  } catch {
    /* malformed URL — ignore */
  }
}

/** Timer id for the resumed OTP poller so we can cancel it to avoid duplicates. */
let resumedPollerTimer: ReturnType<typeof setTimeout> | null = null;

if (DEBUG) console.debug("[ShieldMail] content script loaded");

/** True on iPhone, iPad, and iPod touch (including iPadOS on M-series Macs). */
export function isIOS(): boolean {
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

/** Result of OTP field search — single field or split (per-digit) fields. */
type OtpTarget =
  | { kind: "single"; input: HTMLInputElement }
  | { kind: "split"; inputs: HTMLInputElement[] };

export function findOtpTarget(): OtpTarget | null {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"));
  const visible = inputs.filter((i) => i.type !== "hidden" && !i.disabled && i.offsetParent !== null);

  // 1. Single-field: autocomplete="one-time-code"
  for (const input of visible) {
    const ac = (input.getAttribute("autocomplete") ?? "").toLowerCase();
    if (ac === "one-time-code") return { kind: "single", input };
  }

  // 2. Split fields: group of 4-8 adjacent single-char inputs (Slack, Discord, etc.)
  const singleChar = visible.filter((i) => {
    const ml = i.maxLength;
    return (ml === 1 || ml === -1) && (i.inputMode === "numeric" || i.type === "tel" || i.type === "text" || i.type === "number");
  });
  if (singleChar.length >= 4 && singleChar.length <= 8) {
    // Verify they share a common parent (same OTP group).
    const parent = singleChar[0]!.closest("[data-testid], [class*=otp], [class*=code], [class*=pin], [role=group], form, div");
    if (parent) {
      const inParent = singleChar.filter((i) => parent.contains(i));
      if (inParent.length >= 4 && inParent.length <= 8) {
        return { kind: "split", inputs: inParent };
      }
    }
    // Fallback: if they're contiguous in DOM order, treat as split.
    return { kind: "split", inputs: singleChar };
  }

  // 3. Single-field: inputmode="numeric" + maxLength 4-8
  for (const input of visible) {
    const im = input.inputMode ?? (input.getAttribute("inputmode") ?? "");
    const ml = input.maxLength;
    if (im === "numeric" && ml >= 4 && ml <= 8) return { kind: "single", input };
  }

  // 4. Single-field: name/id/placeholder hint
  for (const input of visible) {
    const hay = `${input.name} ${input.id} ${input.placeholder} ${input.getAttribute("aria-label") ?? ""}`;
    if (OTP_FIELD_HINTS.test(hay)) return { kind: "single", input };
  }

  return null;
}

// Legacy wrapper used by setupOtpAutoFill listener.
function findOtpInput(): HTMLInputElement | null {
  const t = findOtpTarget();
  return t?.kind === "single" ? t.input : t?.kind === "split" ? t.inputs[0]! : null;
}

export function fillOtp(otp: string): boolean {
  const nativeSet = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, "value"
  )?.set;

  const target = findOtpTarget();

  if (target?.kind === "single") {
    const input = target.input;
    input.focus();
    if (nativeSet) nativeSet.call(input, otp);
    else input.value = otp;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: otp }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // Verify the value actually changed.
    return input.value === otp;
  }

  // Split or unknown fields: don't attempt — show toast instead.
  return false;
}

/** Broader search: any visible input that looks like it could accept an OTP. */
export function findFirstOtpLikeInput(): HTMLInputElement | null {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input"));
  for (const input of inputs) {
    if (input.type === "hidden" || input.disabled || !input.offsetParent) continue;
    const ml = input.maxLength;
    const im = input.inputMode ?? (input.getAttribute("inputmode") ?? "");
    const t = input.type;
    // Single-char inputs (split OTP)
    if (ml === 1 && (im === "numeric" || t === "tel" || t === "text" || t === "number")) return input;
    // Short numeric inputs
    if (im === "numeric" && (ml <= 8 || ml === -1)) return input;
    // Tel type with short maxLength (common OTP pattern)
    if (t === "tel" && (ml <= 8 || ml === -1)) return input;
  }
  // Last resort: currently focused input
  const active = document.activeElement;
  if (active instanceof HTMLInputElement && active.type !== "hidden") return active;
  return null;
}

export function fillOtpField(input: HTMLInputElement, otp: string): void {
  // Try smart fill first (handles split fields), fall back to single.
  if (!fillOtp(otp)) {
    const nativeSet = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype, "value"
    )?.set;
    if (nativeSet) nativeSet.call(input, otp);
    else input.value = otp;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, cancelable: true, inputType: "insertText", data: otp }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

// ── Limit toast ──────────────────────────────────────────────────

/** Show a toast when the daily free limit is exceeded (content script context). */
export function showLimitToast(): void {
  document.querySelectorAll("[data-shieldmail-toast],[data-shieldmail-limit-toast]").forEach((e) => e.remove());

  const toast = document.createElement("div");
  toast.setAttribute("data-shieldmail-limit-toast", "");
  toast.style.cssText = [
    "position:fixed", "top:60px", "right:12px",
    "z-index:2147483647",
    "background:#000", "color:#ff9500",
    "border-radius:10px", "padding:10px 16px",
    "text-align:center", "font-family:-apple-system,sans-serif",
    "box-shadow:0 4px 16px rgba(0,0,0,0.4)",
    "max-width:280px",
  ].join(";");

  const limitLabels: Record<string, { title: string; body: string }> = {
    ko: { title: "\u26A0 오늘의 무료 한도 초과", body: "팝업에서 Pro 업그레이드" },
    ja: { title: "\u26A0 本日の無料枠を超過", body: "ポップアップから Pro にアップグレード" },
    zh: { title: "\u26A0 今日免费额度已用完", body: "在弹窗中升级 Pro" },
    fr: { title: "\u26A0 Limite gratuite du jour atteinte", body: "Passez à Pro depuis le popup" },
    hi: { title: "\u26A0 आज की मुफ़्त सीमा समाप्त", body: "पॉपअप से Pro में अपग्रेड करें" },
  };
  const limitLangPrefix = (navigator.language ?? "en").toLowerCase().slice(0, 2);
  const limitText = limitLabels[limitLangPrefix] ?? { title: "\u26A0 Daily free limit exceeded", body: "Upgrade to Pro from the popup" };

  const label = document.createElement("div");
  label.style.cssText = "font-size:13px;font-weight:600;margin-bottom:4px;color:#ff9500";
  label.textContent = limitText.title;

  const body = document.createElement("div");
  body.style.cssText = "font-size:11px;color:#ccc";
  body.textContent = limitText.body;

  toast.appendChild(label);
  toast.appendChild(body);
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 8000);
}

// ── OTP toast ──────────────────────────────────────────────────

/** Copy text to clipboard (requires user gesture on iOS Safari). */
export function copyText(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {});
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.cssText = "position:fixed;left:-9999px;top:-9999px;opacity:0;";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length);
  document.execCommand("copy");
  ta.remove();
}

export function showOtpToast(otp: string): void {
  document.querySelectorAll("[data-shieldmail-toast],[data-shieldmail-status]").forEach(e => e.remove());

  const toast = document.createElement("div");
  toast.setAttribute("data-shieldmail-toast", "");
  toast.style.cssText = [
    "position:fixed", "top:60px", "right:12px",
    "z-index:2147483647",
    "background:#000", "color:#0f0",
    "border-radius:10px", "padding:8px 14px",
    "text-align:center", "font-family:-apple-system,sans-serif",
    "box-shadow:0 4px 16px rgba(0,0,0,0.4)",
  ].join(";");

  const label = document.createElement("div");
  label.style.cssText = "font-size:10px;color:#888;margin-bottom:2px";
  const otpLabels: Record<string, string> = {
    ko: "인증 코드",
    ja: "認証コード",
    zh: "验证码",
    fr: "Code de vérification",
    hi: "सत्यापन कोड",
  };
  const otpLangPrefix = (navigator.language ?? "en").toLowerCase().slice(0, 2);
  label.textContent = otpLabels[otpLangPrefix] ?? "Verification Code";

  const code = document.createElement("div");
  code.style.cssText = "font-size:20px;font-weight:800;letter-spacing:3px;color:#0f0";
  code.textContent = otp;

  toast.appendChild(label);
  toast.appendChild(code);

  document.body.appendChild(toast);

  // Auto-dismiss after 60 seconds.
  const timer = setTimeout(() => toast.remove(), 20000);

  // Dismiss on page navigation (SPA pushState/replaceState + popstate).
  const dismiss = (): void => {
    clearTimeout(timer);
    toast.remove();
    window.removeEventListener("popstate", dismiss);
  };
  window.addEventListener("popstate", dismiss, { once: true });
  // Intercept SPA navigations (pushState/replaceState).
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args) {
    dismiss();
    history.pushState = origPush;
    history.replaceState = origReplace;
    return origPush.apply(this, args);
  };
  history.replaceState = function (...args) {
    dismiss();
    history.pushState = origPush;
    history.replaceState = origReplace;
    return origReplace.apply(this, args);
  };
  // Full navigation: beforeunload.
  window.addEventListener("beforeunload", dismiss, { once: true });
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

  // OTP received: show code.
  setOtpCallback((otp) => {
    iosInjector.hideButton();
    fillOtp(otp);
    showOtpToast(otp);
  });

  // Verify link: open in a new tab when no OTP but a verify link arrives.
  setVerifyLinkCallback((url) => {
    safeOpen(url);
    iosInjector.hideButton();
  });

  // Resume OTP polling if alias was persisted from a previous page.
  const persisted = restorePersistedAlias();
  if (persisted?.pollToken && persisted?.aliasId) {
    // Cancel any previously running resumed poller to prevent duplicate chains.
    if (resumedPollerTimer !== null) {
      clearTimeout(resumedPollerTimer);
      resumedPollerTimer = null;
    }
    const apiBase = "https://api.shldmail.work";
    const maxMs = 5 * 60 * 1000;
    const start = Date.now();
    const resumePoll = async (): Promise<void> => {
      if (Date.now() - start > maxMs) { resumedPollerTimer = null; return; }
      try {
        const resp = await fetch(
          `${apiBase}/alias/${encodeURIComponent(persisted.aliasId)}/messages`,
          { headers: { authorization: `Bearer ${persisted.pollToken}` } },
        );
        if (!resp.ok) { /* retry */ }
        if (resp.ok) {
          const data = (await resp.json()) as {
            messages: Array<{ otp?: string; verifyLinks?: string[]; id: string }>;
            expired: boolean;
          };
          if (data.expired) { resumedPollerTimer = null; return; }
          const msg = data.messages?.[0];
          if (msg?.otp) {
            showOtpToast(msg.otp);
            try { sessionStorage.removeItem("__sm_alias__"); } catch {}
            resumedPollerTimer = null;
            return;
          }
          if (msg?.verifyLinks?.[0]) {
            safeOpen(msg.verifyLinks[0]);
            try { sessionStorage.removeItem("__sm_alias__"); } catch {}
            resumedPollerTimer = null;
            return;
          }
        }
      } catch {
        /* retry */
      }
      resumedPollerTimer = setTimeout(resumePoll, 3000);
    };
    void resumePoll();
  }

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

  // GET_ACTIVE_ALIAS: popup queries the content script directly for the
  // last alias generated by the shield button. This bypasses both
  // chrome.storage and the background SW — pure popup↔content messaging.
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if ((msg as { type?: string })?.type === "SET_ADMIN") {
      try {
        // Store tier only — never persist the admin secret in page-accessible storage.
        const data = msg as { tier?: string };
        sessionStorage.setItem("__sm_admin__", JSON.stringify({ tier: data.tier }));
      } catch {}
      sendResponse({ ok: true });
      return false;
    }
    if ((msg as { type?: string })?.type === "GET_ACTIVE_ALIAS") {
      const alias = getLastGeneratedAlias();
      // Include usage data from sessionStorage so popup can display it.
      let usage: { remaining?: number; limit?: number; tier?: string } = {};
      try {
        const raw = sessionStorage.getItem("__sm_usage__");
        if (raw) usage = JSON.parse(raw);
      } catch {}
      sendResponse(alias ? { ok: true, record: alias, usage } : { ok: false });
      return false;
    }
    return undefined;
  });

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
