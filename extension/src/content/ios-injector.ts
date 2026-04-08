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
import type { AliasMode, RuntimeMessage } from "../lib/types";

type IconState =
  | "default"
  | "active"
  | "generating"
  | "done"
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
  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
    .shield-btn { transition: none; }
  }
`;

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
    host.style.cssText = `
      position: fixed;
      z-index: 2147483600;
      pointer-events: none;
    `;

    const shadow = host.attachShadow({ mode: "closed" });
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
    const vpHeight  = vp ? vp.height  : window.innerHeight;
    const vpOffsetY = vp ? vp.offsetTop : 0;
    const vpOffsetX = vp ? vp.offsetLeft : 0;

    // Bottom of visible viewport (above keyboard)
    const bottom = window.innerHeight - vpHeight - vpOffsetY + BUTTON_BOTTOM_MARGIN;
    const right  = BUTTON_RIGHT_OFFSET - vpOffsetX;

    this.host.style.bottom = `${Math.max(BUTTON_BOTTOM_MARGIN, bottom + BUTTON_BOTTOM_MARGIN)}px`;
    this.host.style.right  = `${Math.max(BUTTON_RIGHT_OFFSET, right)}px`;
  }

  private setVisible(visible: boolean): void {
    if (!this.host) return;
    this.host.style.display = visible ? "block" : "none";
    if (visible && this.state === "hidden") this.setState("default");
  }

  private setState(s: IconState): void {
    this.state = s;
    if (!this.button) return;
    this.button.setAttribute("data-state", s);
    this.button.setAttribute("aria-busy", s === "generating" ? "true" : "false");

    const label = {
      default:    "ShieldMail 임시 이메일 생성",
      active:     "ShieldMail 임시 이메일 생성",
      generating: "ShieldMail 주소 생성 중",
      done:       "ShieldMail 주소 입력 완료",
      error:      "ShieldMail 오류. 다시 시도하려면 탭하세요",
      hidden:     "",
    }[s];
    this.button.setAttribute("aria-label", label);
  }

  private setButtonState(s: IconState): void {
    this.setState(s);
  }

  private async handleActivate(): Promise<void> {
    if (this.state === "generating") return;
    this.setState("generating");

    const input = this.deps.getCurrentInput();
    const msg: RuntimeMessage = {
      type: "GENERATE_ALIAS",
      mode: this.deps.getMode(),
      origin: location.origin,
      label: document.title.slice(0, 64),
    };

    const res = await sendMessage<
      | { type: "GENERATE_ALIAS_RESULT"; ok: true;  record: { aliasId: string; address: string; pollToken?: string } }
      | { type: "GENERATE_ALIAS_RESULT"; ok: false; error: string }
      | { ok: false; error: string }
    >(msg, 8000);

    if (!res || (res as { ok?: boolean }).ok === false) {
      this.setState("error");
      haptic("error");
      setTimeout(() => this.setState("default"), 2000);
      return;
    }

    const record = (res as { record: { aliasId: string; address: string; pollToken?: string } }).record;
    if (!record?.address) {
      this.setState("error");
      haptic("error");
      setTimeout(() => this.setState("default"), 2000);
      return;
    }

    if (input) {
      this.fillField(input, record.address);
    }

    // Persist to Keychain recent-aliases for long-press menu
    appendRecentAlias({ aliasId: record.aliasId, address: record.address });

    haptic("success");
    this.setState("done");
    setTimeout(() => {
      if (!this.host) return;
      this.host.style.transition = "opacity 300ms ease-out, transform 300ms ease-out";
      this.host.style.opacity = "0";
      this.host.style.transform = "scale(0.8)";
      setTimeout(() => this.setState("hidden"), 300);
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
    `;
  }
}
