/**
 * ShieldIconInjector — attaches a Shadow DOM host adjacent to an email-like
 * input, renders an inline SVG shield (based on shield-mail-mono-black.svg),
 * manages 6 states, and wires click → GENERATE_ALIAS → FILL_FIELD.
 *
 * Privacy: does NOT read the email field's value except to check whether it
 * is pre-filled (length > 0 branch). Never transmits DOM content.
 */

import { sendMessage } from "./bridge";
import type {
  AliasMode,
  RuntimeMessage,
} from "../lib/types";
import shieldStyles from "./shieldIcon.css";

type IconState =
  | "default"
  | "hover"
  | "active"
  | "generating"
  | "done"
  | "error"
  | "fade-out";

export interface InjectorDeps {
  getMode: () => AliasMode;
}

interface MountedIcon {
  host: HTMLDivElement;
  root: ShadowRoot;
  button: HTMLButtonElement;
  tooltip: HTMLDivElement;
  input: HTMLInputElement;
  state: IconState;
  ro?: ResizeObserver;
}

/** Path data extracted from assets/icons/shield-mail-mono-black.svg (viewBox 0 0 128 128). */
const SHIELD_PATH_D =
  "M64 8 C48 8 32 10 20 15 C18 16 16 18 16 21 L16 62 C16 91 35 114 62 120 C63 120 65 120 66 120 C93 114 112 91 112 62 L112 21 C112 18 110 16 108 15 C96 10 80 8 64 8 Z M36 46 C34 46 32 48 32 50 L32 86 C32 88 34 90 36 90 L92 90 C94 90 96 88 96 86 L96 50 C96 48 94 46 92 46 Z M40 52 L64 70 L88 52 L88 84 L40 84 Z";

export class ShieldIconInjector {
  private readonly mounted = new WeakMap<HTMLInputElement, MountedIcon>();
  private shortcutLabel = "⌘⇧E";

  constructor(private readonly deps: InjectorDeps) {
    this.resolveShortcut();
    // HOTKEY: no longer a window-level listener. The Cmd/Ctrl+Shift+E shortcut
    // is owned by manifest.json `commands.shieldmail-generate` → background
    // service worker → FORCE_INJECT runtime message → content receiver in
    // content/index.ts. Single source of truth avoids double `generate` calls.
  }

  /** Ensure an icon exists for the given email-like input. */
  public inject(input: HTMLInputElement): void {
    if (this.mounted.has(input)) return;
    const host = document.createElement("div");
    host.setAttribute("data-shieldmail-host", "");
    host.style.position = "absolute";
    host.style.pointerEvents = "auto";
    host.style.zIndex = "2147483600";

    const root = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = shieldStyles;
    root.appendChild(style);

    const btn = document.createElement("button");
    btn.className = "shield";
    btn.setAttribute("type", "button");
    btn.setAttribute("role", "button");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-label", "ShieldMail 임시 이메일 생성");
    btn.setAttribute("aria-live", "polite");
    btn.setAttribute("aria-busy", "false");
    btn.setAttribute("data-sm-state", "default");
    btn.innerHTML = this.renderSvg();
    root.appendChild(btn);

    const tooltip = document.createElement("div");
    tooltip.className = "tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.textContent = `ShieldMail 주소 생성 (${this.shortcutLabel})`;
    root.appendChild(tooltip);

    const icon: MountedIcon = {
      host,
      root,
      button: btn,
      tooltip,
      input,
      state: "default",
    };
    this.mounted.set(input, icon);

    document.body.appendChild(host);
    this.positionHost(icon);

    // Enforce padding so shield doesn't overlap text
    const currentPadding = parseFloat(getComputedStyle(input).paddingRight) || 0;
    if (currentPadding < 28) {
      input.style.paddingRight = "28px";
    }

    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      void this.handleActivate(icon);
    });
    btn.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        void this.handleActivate(icon);
      }
    });

    const reposition = (): void => this.positionHost(icon);
    window.addEventListener("scroll", reposition, { passive: true, capture: true });
    window.addEventListener("resize", reposition, { passive: true });
    if (typeof ResizeObserver !== "undefined") {
      icon.ro = new ResizeObserver(reposition);
      icon.ro.observe(input);
    }

    // Mount animation — next frame
    requestAnimationFrame(() => btn.classList.add("mounted"));
  }

  public removeFor(input: HTMLInputElement): void {
    const icon = this.mounted.get(input);
    if (!icon) return;
    this.setState(icon, "fade-out");
    setTimeout(() => {
      icon.ro?.disconnect();
      icon.host.remove();
      this.mounted.delete(input);
    }, 350);
  }

  /** FORCE_INJECT path: inject on the given field and immediately generate. */
  public forceInjectAndGenerate(input: HTMLInputElement): void {
    const existing = this.mounted.get(input);
    if (existing) {
      if (existing.state === "generating") {
        // Already in progress — re-trigger via icon click.
        existing.button.click();
        return;
      }
      void this.handleActivate(existing);
      return;
    }
    this.inject(input);
    const icon = this.mounted.get(input);
    if (icon) void this.handleActivate(icon);
  }

  /** Programmatic trigger (keyboard shortcut path). */
  public async triggerFirstVisible(): Promise<void> {
    // Try any mounted icon's input first
    const firstInput = document.querySelector<HTMLInputElement>(
      'input[type="email"], input[autocomplete*="email"], input[inputmode="email"]'
    );
    if (!firstInput) return;
    let icon = this.mounted.get(firstInput);
    if (!icon) {
      this.inject(firstInput);
      icon = this.mounted.get(firstInput);
    }
    if (icon) await this.handleActivate(icon);
  }

  /* ------------------------------- internals ------------------------------- */

  private positionHost(icon: MountedIcon): void {
    const rect = icon.input.getBoundingClientRect();
    const size = 20;
    const inline = rect.height >= 32;
    const top = window.scrollY + rect.top + rect.height / 2 - size / 2;
    const left = inline
      ? window.scrollX + rect.right - size - 8
      : window.scrollX + rect.right + 8;
    icon.host.style.top = `${top}px`;
    icon.host.style.left = `${left}px`;
  }

  private setState(icon: MountedIcon, state: IconState): void {
    icon.state = state;
    icon.button.setAttribute("data-sm-state", state);
    icon.button.setAttribute("aria-busy", state === "generating" ? "true" : "false");
  }

  private async handleActivate(icon: MountedIcon): Promise<void> {
    if (icon.state === "generating") return;
    this.setState(icon, "active");
    setTimeout(() => this.setState(icon, "generating"), 100);

    const msg: RuntimeMessage = {
      type: "GENERATE_ALIAS",
      mode: this.deps.getMode(),
      origin: location.origin,
      label: document.title.slice(0, 64),
    };

    const res = await sendMessage<
      | { type: "GENERATE_ALIAS_RESULT"; ok: true; record: { address: string } }
      | { type: "GENERATE_ALIAS_RESULT"; ok: false; error: string }
      | { ok: false; error: string }
    >(msg, 8000);

    if (!res || (res as { ok?: boolean }).ok === false) {
      this.setState(icon, "error");
      return;
    }

    const record = (res as { record: { address: string } }).record;
    if (!record?.address) {
      this.setState(icon, "error");
      return;
    }

    this.fillField(icon.input, record.address);
    this.setState(icon, "done");
    setTimeout(() => this.setState(icon, "fade-out"), 1200);
    setTimeout(() => {
      icon.ro?.disconnect();
      icon.host.remove();
      this.mounted.delete(icon.input);
    }, 1200 + 350);
  }

  private fillField(input: HTMLInputElement, address: string): void {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(input, address);
    // Dispatch InputEvent with inputType/data for Vue 3 / Svelte reactive binding compatibility.
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: address,
      })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  // bindGlobalHotkey removed — see constructor comment. The keyboard shortcut
  // is handled exclusively via manifest commands + background FORCE_INJECT.

  private resolveShortcut(): void {
    try {
      chrome.commands?.getAll?.((cmds) => {
        const c = cmds.find((x) => x.name === "shieldmail-generate");
        if (c?.shortcut) this.shortcutLabel = c.shortcut;
      });
    } catch {
      /* fallback already set */
    }
  }

  private renderSvg(): string {
    return `
      <svg class="shield-icon" width="20" height="20" viewBox="0 0 128 128" aria-hidden="true">
        <path fill="currentColor" fill-rule="evenodd" d="${SHIELD_PATH_D}"/>
      </svg>
      <svg class="spinner" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"
                stroke-dasharray="38" stroke-dashoffset="28" stroke-linecap="round"/>
      </svg>
    `;
  }
}
