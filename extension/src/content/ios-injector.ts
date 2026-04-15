/**
 * iOSFloatingButtonInjector — iOS Safari-specific shield button.
 *
 * Key differences vs macOS ShieldIconInjector:
 *  - Fixed-position floating button (56×56px, bottom-right corner)
 *  - Tracks keyboard height via window.visualViewport
 *  - Haptic feedback via safari.extension.dispatchMessage
 *  - One button for the entire page (not per-input)
 *  - iPad split view awareness
 *
 * Privacy: same guarantees as macOS injector — no field values read/sent.
 */

import { sendMessage } from "./bridge";
import { haptic, appendRecentAlias } from "./ios-bridge";
import { getOrCreateDeviceId } from "../lib/device";
import { getSubscriptionState } from "../lib/subscription";
import type { AliasMode, RuntimeMessage } from "../lib/types";

type IconState =
  | "default"
  | "active"
  | "generating"
  | "done"
  | "polling"
  | "otp-done"
  | "error"
  | "hidden";

export interface IOSInjectorDeps {
  getMode: () => AliasMode;
  getCurrentInput: () => HTMLInputElement | null;
}

/** Path data from shield-mail-mono-black.svg (viewBox 0 0 128 128). */
const SHIELD_PATH_D =
  "M64 8 C48 8 32 10 20 15 C18 16 16 18 16 21 L16 62 C16 91 35 114 62 120 C63 120 65 120 66 120 C93 114 112 91 112 62 L112 21 C112 18 110 16 108 15 C96 10 80 8 64 8 Z M36 46 C34 46 32 48 32 50 L32 86 C32 88 34 90 36 90 L92 90 C94 90 96 88 96 86 L96 50 C96 48 94 46 92 46 Z M40 52 L64 70 L88 52 L88 84 L40 84 Z";

const BUTTON_SIZE = 56;
const BUTTON_RIGHT_OFFSET = 12;
const BUTTON_BOTTOM_MARGIN = 8;

const CSS = `
  :host { all: initial; }
  .shield-btn {
    width: ${BUTTON_SIZE}px;
    height: ${BUTTON_SIZE}px;
    border-radius: 18px;
    border: none;
    cursor: pointer;
    background: var(--sm-accent, #00D4AA);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    position: relative;
    transition: transform 120ms ease-out, box-shadow 120ms ease-out;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }
  .shield-btn:active {
    transform: scale(0.92);
    box-shadow: 0 2px 8px rgba(0,0,0,0.14);
  }
  .shield-btn[data-state="generating"] {
    background: var(--sm-accent, #00D4AA);
  }
  .shield-btn[data-state="done"] {
    background: #00D4AA;
  }
  .shield-btn[data-state="error"] {
    background: #FF3B30;
    box-shadow: 0 4px 16px rgba(255,59,48,0.35);
  }
  .shield-icon {
    width: 28px; height: 28px;
    transition: opacity 180ms;
  }
  .shield-btn[data-state="generating"] .shield-icon {
    opacity: 0.5;
  }
  .shield-btn[data-state="done"] .shield-icon {
    display: none;
  }
  .spinner {
    position: absolute;
    width: 42px; height: 42px;
    display: none;
    animation: spin 1.2s linear infinite;
  }
  .shield-btn[data-state="generating"] .spinner { display: block; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .checkmark {
    position: absolute;
    width: 26px; height: 26px;
    display: none;
  }
  .shield-btn[data-state="done"] .checkmark { display: block; }
  .error-icon {
    position: absolute;
    font-size: 22px;
    font-family: -apple-system, sans-serif;
    display: none;
    color: #fff;
  }
  .shield-btn[data-state="error"] .shield-icon { display: none; }
  .shield-btn[data-state="error"] .error-icon { display: block; }
  /* ── polling: waiting for OTP ── */
  .shield-btn[data-state="polling"] {
    width: 40px; height: 40px;
    border-radius: 14px;
    background: #007AFF;
    animation: pulse 2s ease-in-out infinite;
  }
  .shield-btn[data-state="polling"] .shield-icon { display: none; }
  .shield-btn[data-state="polling"] .spinner { display: none; }
  .shield-btn[data-state="polling"] .checkmark { display: none; }
  .shield-btn[data-state="polling"] .poll-icon { display: block; }
  @keyframes pulse {
    0%, 100% { box-shadow: 0 2px 8px rgba(0,122,255,0.3); }
    50% { box-shadow: 0 2px 20px rgba(0,122,255,0.6); }
  }
  .poll-icon {
    position: absolute;
    display: none;
    font-size: 18px;
    font-family: -apple-system, sans-serif;
    color: #fff;
    line-height: 1;
  }
  /* ── otp-done: code filled ── */
  .shield-btn[data-state="otp-done"] {
    background: #00D4AA;
  }
  .shield-btn[data-state="otp-done"] .shield-icon { display: none; }
  .shield-btn[data-state="otp-done"] .checkmark { display: block; }
  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
    .shield-btn { transition: none; }
    .shield-btn[data-state="polling"] { animation: none; }
  }
`;

const SESSION_KEY = "__sm_alias__";
const SESSION_USAGE_KEY = "__sm_usage__";

/** Show a toast when the daily free limit is exceeded. */
function showLimitToast(): void {
  // Remove any existing ShieldMail toasts.
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

  const label = document.createElement("div");
  label.style.cssText = "font-size:13px;font-weight:600;margin-bottom:4px;color:#ff9500";
  label.textContent = "\u26A0 \uC624\uB298\uC758 \uBB34\uB8CC \uD55C\uB3C4 \uCD08\uACFC";

  const body = document.createElement("div");
  body.style.cssText = "font-size:11px;color:#ccc";
  body.textContent = "\uD31D\uC5C5\uC5D0\uC11C Pro \uC5C5\uADF8\uB808\uC774\uB4DC";

  toast.appendChild(label);
  toast.appendChild(body);
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 8000);
}

/**
 * Last alias generated by the shield button. Stored both in-memory and in
 * sessionStorage so OTP polling survives page navigations (e.g. signup → OTP page).
 */
let lastGeneratedAlias: import("../lib/types").AliasRecord | null = null;

function persistAlias(record: import("../lib/types").AliasRecord): void {
  lastGeneratedAlias = record;
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(record)); } catch {}
}

/** Restore alias from sessionStorage (survives same-origin navigations). */
export function restorePersistedAlias(): import("../lib/types").AliasRecord | null {
  if (lastGeneratedAlias) return lastGeneratedAlias;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      lastGeneratedAlias = JSON.parse(raw);
      return lastGeneratedAlias;
    }
  } catch {}
  return null;
}

/** Called from content/index.ts message handler. */
export function getLastGeneratedAlias(): import("../lib/types").AliasRecord | null {
  return lastGeneratedAlias ?? restorePersistedAlias();
}

/** Callback set by content/index.ts to receive OTP or verify link. */
let onOtpReceived: ((otp: string) => void) | null = null;
let onVerifyLink: ((url: string) => void) | null = null;
export function setOtpCallback(cb: (otp: string) => void): void {
  onOtpReceived = cb;
}
export function setVerifyLinkCallback(cb: (url: string) => void): void {
  onVerifyLink = cb;
}

/** Module-level timer for OTP poller — prevents duplicate polling chains. */
let otpPollerTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Poll the Worker API for OTP messages directly from the content script.
 * No popup or background SW needed. Stops after OTP found or 5 min timeout.
 * Cancels any previously running poller before starting a new one.
 */
function startOtpPoller(aliasId: string, pollToken: string): void {
  // Cancel any existing poller to prevent duplicate chains.
  if (otpPollerTimer !== null) {
    clearTimeout(otpPollerTimer);
    otpPollerTimer = null;
  }

  const apiBase = "https://api.shldmail.work";
  const maxMs = 5 * 60 * 1000; // 5 min
  const start = Date.now();

  const poll = async (): Promise<void> => {
    if (Date.now() - start > maxMs) { otpPollerTimer = null; return; } // timeout
    try {
      const resp = await fetch(
        `${apiBase}/alias/${encodeURIComponent(aliasId)}/messages`,
        { headers: { authorization: `Bearer ${pollToken}` } },
      );
      if (!resp.ok) { otpPollerTimer = setTimeout(poll, 3000); return; }
      const data = (await resp.json()) as {
        messages: Array<{ otp?: string; verifyLinks?: string[]; id: string }>;
        expired: boolean;
      };
      if (data.expired) { otpPollerTimer = null; return; }
      const msg = data.messages?.[0];
      if (msg?.otp) {
        otpPollerTimer = null;
        onOtpReceived?.(msg.otp);
        return; // done
      }
      if (msg?.verifyLinks?.[0]) {
        otpPollerTimer = null;
        onVerifyLink?.(msg.verifyLinks[0]);
        return; // done
      }
    } catch { /* retry */ }
    otpPollerTimer = setTimeout(poll, 3000);
  };

  void poll();
}

export class IOSFloatingButtonInjector {
  private host: HTMLDivElement | null = null;
  private button: HTMLButtonElement | null = null;
  private state: IconState = "hidden";
  private vpListener: (() => void) | null = null;

  constructor(private readonly deps: IOSInjectorDeps) {}

  /** Show the floating button (called when a signup form is detected). */
  public show(): void {
    if (this.host) {
      this.setVisible(true);
      return;
    }
    this.mount();
  }

  /** Hide the floating button (called when the form is removed). */
  public hide(): void {
    this.setVisible(false);
  }

  /** Set the button to polling state externally (e.g. resumed after navigation). */
  public showPolling(): void {
    this.setState("polling");
  }

  /** Hide the floating button. */
  public hideButton(): void {
    if (this.host) this.host.style.display = "none";
  }

  /** FORCE_INJECT path — show + immediately trigger generation. */
  public forceGenerate(): void {
    this.show();
    void this.handleActivate();
  }

  public destroy(): void {
    this.vpListener && window.visualViewport?.removeEventListener("resize", this.vpListener);
    this.host?.remove();
    this.host = null;
    this.button = null;
  }

  /* ───────────────────────── private ───────────────────────── */

  private mount(): void {
    const host = document.createElement("div");
    host.setAttribute("data-shieldmail-ios", "");
    // right is set statically — position:fixed is already relative to the
    // visual viewport, so no per-frame adjustment for iPad split view needed.
    host.style.cssText = `
      position: fixed;
      right: ${BUTTON_RIGHT_OFFSET}px;
      z-index: 2147483600;
      pointer-events: none;
    `;

    // Open shadow root: closed mode prevented unit tests from inspecting
    // button state. CSS isolation (the actual reason we use Shadow DOM) is
    // the same in both modes; closed only blocks JS introspection from
    // outside, which we don't actually need for security here (the page
    // can still see the host element regardless).
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);

    const btn = document.createElement("button");
    btn.className = "shield-btn";
    btn.setAttribute("type", "button");
    btn.setAttribute("aria-label", "ShieldMail 임시 이메일 생성");
    btn.setAttribute("aria-live", "polite");
    btn.setAttribute("data-state", "default");
    btn.innerHTML = this.renderSvg();
    shadow.appendChild(btn);

    host.style.pointerEvents = "auto";
    document.body.appendChild(host);

    this.host = host;
    this.button = btn;

    this.updatePosition();

    // Track keyboard / viewport changes
    const onViewportResize = () => this.updatePosition();
    this.vpListener = onViewportResize;
    window.visualViewport?.addEventListener("resize", onViewportResize, { passive: true });
    window.visualViewport?.addEventListener("scroll", onViewportResize, { passive: true });

    // Touch events — passive:false required so preventDefault() suppresses
    // the 300ms tap delay and ghost click on iOS.
    btn.addEventListener("touchstart", (ev) => {
      ev.preventDefault();
      haptic("medium");
      this.setButtonState("active");
    }, { passive: false });

    btn.addEventListener("touchend", (ev) => {
      ev.preventDefault();
      if (this.state !== "generating") void this.handleActivate();
    }, { passive: false });

    // Fallback click (physical keyboard, pointer device on iPad)
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      if (this.state !== "generating") void this.handleActivate();
    });

    // Animate in
    requestAnimationFrame(() => {
      host.style.transition = "opacity 200ms ease-out, transform 200ms ease-out";
      host.style.opacity = "1";
      host.style.transform = "scale(1)";
    });
    host.style.opacity = "0";
    host.style.transform = "scale(0.8)";

    this.setState("default");
  }

  private updatePosition(): void {
    if (!this.host) return;
    const vp = window.visualViewport;

    // `position: fixed` is always relative to the visual viewport, so
    // `right` is a constant CSS value — no vpOffsetX correction needed.
    // Only `bottom` needs to be adjusted dynamically to stay above the keyboard.
    const vpHeight  = vp ? vp.height  : window.innerHeight;
    const vpOffsetY = vp ? vp.offsetTop : 0;

    // Distance from bottom of layout viewport to top of visual viewport.
    // When keyboard is hidden: vpHeight ≈ innerHeight → keyboardOffset ≈ 0.
    // When keyboard is visible: vpHeight < innerHeight → keyboardOffset > 0.
    const keyboardOffset = Math.max(0, window.innerHeight - vpHeight - vpOffsetY);

    this.host.style.bottom = `${keyboardOffset + BUTTON_BOTTOM_MARGIN}px`;
    // right is set once in mount() via CSS; no update needed here.
  }

  private setVisible(visible: boolean): void {
    if (!this.host) return;
    this.host.style.display = visible ? "block" : "none";
    if (visible && this.state === "hidden") this.setState("default");
  }

  // DEV: show error detail as a floating label below the button.
  private showErrorDetail(msg: string): void {
    if (!this.host) return;
    const shadow = this.host.shadowRoot;
    if (!shadow) return;
    let label = shadow.querySelector<HTMLDivElement>(".error-detail");
    if (!label) {
      label = document.createElement("div");
      label.className = "error-detail";
      label.style.cssText =
        "position:absolute;bottom:-36px;right:0;background:#ff3b30;color:#fff;" +
        "font:11px/1.3 -apple-system,sans-serif;padding:4px 8px;border-radius:6px;" +
        "white-space:nowrap;pointer-events:none;z-index:99999;max-width:300px;" +
        "overflow:hidden;text-overflow:ellipsis;";
      shadow.appendChild(label);
    }
    label.textContent = msg;
    setTimeout(() => label?.remove(), 6000);
  }

  private setState(s: IconState): void {
    this.state = s;
    if (!this.button) return;
    this.button.setAttribute("data-state", s);
    this.button.setAttribute("aria-busy", s === "generating" ? "true" : "false");

    const label: Record<IconState, string> = {
      default:    "ShieldMail 임시 이메일 생성",
      active:     "ShieldMail 임시 이메일 생성",
      generating: "ShieldMail 주소 생성 중",
      done:       "ShieldMail 주소 입력 완료",
      polling:    "ShieldMail 인증 코드 수신 대기 중",
      "otp-done": "ShieldMail 인증 코드 입력 완료",
      error:      "ShieldMail 오류. 다시 시도하려면 탭하세요",
      hidden:     "",
    };
    this.button.setAttribute("aria-label", label[s]);
  }

  private setButtonState(s: IconState): void {
    this.setState(s);
  }

  private async handleActivate(): Promise<void> {
    if (this.state === "generating") return;
    this.setState("generating");

    const input = this.deps.getCurrentInput();

    // Direct API call — bypasses background SW (unreliable on iOS Safari).
    // Content scripts have fetch() access via host_permissions.
    let address = "";
    let generatedAliasId = "";
    try {
      const apiBase = "https://api.shldmail.work";
      const mode = this.deps.getMode();

      const [deviceId, sub] = await Promise.all([
        getOrCreateDeviceId(),
        getSubscriptionState(),
      ]);

      const body: Record<string, unknown> = {
        mode,
        label: document.title.slice(0, 64),
        deviceId,
      };
      if (sub.jws) body.subscriptionJWS = sub.jws;

      // Admin override: try sessionStorage first (reliable on iOS), then chrome.storage.
      try {
        const raw = sessionStorage.getItem("__sm_admin__");
        if (raw) {
          const admin = JSON.parse(raw) as { secret?: string; tier?: string };
          if (typeof admin.secret === "string" && admin.secret.length > 0) body.adminSecret = admin.secret;
          if (admin.tier === "pro" || admin.tier === "free") body.adminTier = admin.tier;
        }
      } catch {}
      if (!body.adminSecret) {
        try {
          if (typeof chrome !== "undefined" && chrome.storage?.local) {
            const adminData = await Promise.race([
              chrome.storage.local.get(["adminSecret", "adminTier"]) as Promise<Record<string, unknown>>,
              new Promise<Record<string, unknown>>((r) => setTimeout(() => r({}), 1000)),
            ]);
            if (typeof adminData.adminSecret === "string" && adminData.adminSecret.length > 0) body.adminSecret = adminData.adminSecret;
            if (adminData.adminTier === "pro" || adminData.adminTier === "free") body.adminTier = adminData.adminTier as string;
          }
        } catch {}
      }

      const resp = await fetch(`${apiBase}/alias/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      // Handle 403 daily_limit_exceeded
      if (resp.status === 403) {
        try {
          const errData = (await resp.json()) as { code?: string; error?: string };
          if (errData.error === "daily_limit_exceeded") {
            showLimitToast();
            this.setState("error");
            haptic("error");
            setTimeout(() => this.setState("default"), 4000);
            return;
          }
        } catch { /* fallthrough */ }
        throw new Error("http_403");
      }

      if (!resp.ok) throw new Error(`http_${resp.status}`);
      const data = (await resp.json()) as {
        aliasId: string;
        address: string;
        expiresAt: number | null;
        pollToken: string;
        remaining?: number;
        limit?: number;
        tier?: string;
      };
      address = data.address;
      generatedAliasId = data.aliasId;
      if (!address) throw new Error("no address");

      // Persist remaining usage to sessionStorage for cross-page access.
      if (typeof data.remaining === "number" && typeof data.limit === "number") {
        try {
          sessionStorage.setItem(SESSION_USAGE_KEY, JSON.stringify({
            remaining: data.remaining,
            limit: data.limit,
            tier: data.tier ?? "free",
          }));
        } catch { /* best-effort */ }
      }

      // Store in memory + sessionStorage so polling survives page navigations.
      persistAlias({
        aliasId: data.aliasId,
        address: data.address,
        expiresAt: data.expiresAt ? data.expiresAt * 1000 : null,
        pollToken: data.pollToken,
        mode,
        createdAt: Date.now(),
        origin: location.origin,
      });

      // Start OTP polling directly from content script — no popup needed.
      startOtpPoller(data.aliasId, data.pollToken);

      // Best-effort: also try background storage for poller/notifications.
      try {
        if (lastGeneratedAlias) {
          void sendMessage({ type: "STORE_ALIAS", record: lastGeneratedAlias }, 3000);
        }
      } catch { /* non-critical */ }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "unknown";
      this.showErrorDetail(`generate failed: ${errMsg}`);
      this.setState("error");
      haptic("error");
      setTimeout(() => this.setState("default"), 4000);
      return;
    }

    if (!address) {
      this.showErrorDetail("no address");
      this.setState("error");
      haptic("error");
      setTimeout(() => this.setState("default"), 4000);
      return;
    }

    const record = { aliasId: generatedAliasId, address };

    if (input) {
      this.fillField(input, record.address);
    }

    // Persist to Keychain recent-aliases for long-press menu
    appendRecentAlias({ aliasId: record.aliasId, address: record.address });

    haptic("success");
    this.setState("done");
    // After brief checkmark, shrink to polling indicator.
    setTimeout(() => {
      if (!this.host) return;
      this.setState("polling");
    }, 1200);
  }

  private fillField(input: HTMLInputElement, address: string): void {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(input, address);
    input.dispatchEvent(new InputEvent("input", {
      bubbles: true, cancelable: true, inputType: "insertText", data: address,
    }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur",   { bubbles: true }));
  }

  private renderSvg(): string {
    return `
      <svg class="shield-icon" width="28" height="28"
           viewBox="0 0 128 128" aria-hidden="true">
        <path fill="currentColor" fill-rule="evenodd" d="${SHIELD_PATH_D}"/>
      </svg>
      <svg class="spinner" viewBox="0 0 42 42" aria-hidden="true">
        <circle cx="21" cy="21" r="17" fill="none"
                stroke="rgba(255,255,255,0.6)" stroke-width="2.5"
                stroke-dasharray="80" stroke-dashoffset="60"
                stroke-linecap="round"/>
      </svg>
      <svg class="checkmark" viewBox="0 0 26 26" aria-hidden="true">
        <polyline points="4,13 10,20 22,7" fill="none"
                  stroke="white" stroke-width="2.8"
                  stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="error-icon" aria-hidden="true">!</span>
      <span class="poll-icon" aria-hidden="true">···</span>
    `;
  }
}
