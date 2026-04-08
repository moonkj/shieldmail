/**
 * MutationObserver with 250ms debounce. Re-evaluates forms on added/removed
 * input/form/button nodes. Per-form re-evaluation limit: 3.
 */

import { discoverForms } from "./detect/forms";
import { evaluateForm, type ScoreResult } from "./detect/scorer";

const DEBOUNCE_MS = 250;
const MAX_REEVAL = 3;
const INTERESTING = new Set(["INPUT", "FORM", "BUTTON", "LABEL"]);

export interface ObserverDeps {
  onActivated: (form: HTMLFormElement | HTMLElement, result: ScoreResult) => void;
  onDeactivated: (form: HTMLFormElement | HTMLElement) => void;
  threshold: () => number;
}

export class SignupObserver {
  private observer: MutationObserver | null = null;
  private timer: number | null = null;
  private readonly evalCounts = new WeakMap<HTMLElement, number>();
  private readonly activated = new WeakSet<HTMLElement>();

  constructor(private readonly deps: ObserverDeps) {}

  public start(): void {
    const run = (): void => this.evaluateAll();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run, { once: true });
    } else {
      run();
    }
    window.addEventListener("load", run, { once: true });
    setTimeout(run, 2000);

    this.observer = new MutationObserver((mutations) => {
      if (!this.hasInterestingMutation(mutations)) return;
      this.schedule();
    });
    this.observer.observe(document.body, { subtree: true, childList: true });
  }

  public stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    if (this.timer != null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      this.evaluateAll();
    }, DEBOUNCE_MS);
  }

  private evaluateAll(): void {
    const candidates = discoverForms(document);
    for (const cand of candidates) {
      const el = cand.form as HTMLElement;
      const count = this.evalCounts.get(el) ?? 0;
      if (count >= MAX_REEVAL && !this.activated.has(el)) continue;
      this.evalCounts.set(el, count + 1);
      const result = evaluateForm(cand.form, document, {
        threshold: this.deps.threshold(),
      });
      if (result.activated) {
        if (!this.activated.has(el)) {
          this.activated.add(el);
          this.deps.onActivated(cand.form, result);
        }
      } else if (this.activated.has(el)) {
        this.activated.delete(el);
        this.deps.onDeactivated(cand.form);
      }
    }
  }

  private hasInterestingMutation(mutations: MutationRecord[]): boolean {
    for (const m of mutations) {
      for (const n of Array.from(m.addedNodes)) {
        if (n instanceof HTMLElement && (INTERESTING.has(n.tagName) || n.querySelector?.("input,form,button"))) {
          return true;
        }
      }
      for (const n of Array.from(m.removedNodes)) {
        if (n instanceof HTMLElement && INTERESTING.has(n.tagName)) return true;
      }
    }
    return false;
  }
}
