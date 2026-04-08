/**
 * Form discovery and email-like field finder (Gate A).
 *
 * Privacy: never reads non-email field values. Only inspects attributes,
 * labels, and structure to identify candidates.
 */

import { EMAIL_FIELD_HINT } from "./keywords";

export interface FormCandidate {
  form: HTMLFormElement | HTMLElement; // may be synthetic container for <form>-less pages
  emailField: HTMLInputElement | null;
}

/** True if element is rendered and visible in the viewport tree. */
export function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.hidden) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  return true;
}

/** Resolve <label> text for an input via `for=` or aria-labelledby or wrapping <label>. */
function labelTextFor(input: HTMLInputElement): string {
  const doc = input.ownerDocument;
  const parts: string[] = [];
  if (input.id) {
    const lbl = doc.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    if (lbl?.textContent) parts.push(lbl.textContent);
  }
  const labelledBy = input.getAttribute("aria-labelledby");
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const el = doc.getElementById(id);
      if (el?.textContent) parts.push(el.textContent);
    }
  }
  const parentLabel = input.closest("label");
  if (parentLabel?.textContent) parts.push(parentLabel.textContent);
  const ariaLabel = input.getAttribute("aria-label");
  if (ariaLabel) parts.push(ariaLabel);
  return parts.join(" ").trim();
}

/** Gate A — identify an email-like input inside (or near) a form. */
export function findEmailLikeInput(root: ParentNode): HTMLInputElement | null {
  const inputs = Array.from(root.querySelectorAll<HTMLInputElement>("input"));
  for (const input of inputs) {
    if (input.type === "hidden" || input.disabled) continue;
    if (!isVisible(input)) continue;
    if (input.type === "email") return input;
    if (input.inputMode === "email") return input;
    const autocomplete = (input.getAttribute("autocomplete") ?? "").toLowerCase();
    if (autocomplete.includes("email")) return input;
    const hay = `${input.name} ${input.id} ${input.placeholder}`;
    if (EMAIL_FIELD_HINT.test(hay)) return input;
    const labelText = labelTextFor(input);
    if (labelText && EMAIL_FIELD_HINT.test(labelText)) return input;
  }
  return null;
}

/**
 * Enumerate forms in the current document. Also returns a synthetic root
 * wrapping loose inputs for form-less signup pages (SPAs).
 */
export function discoverForms(doc: Document): FormCandidate[] {
  const out: FormCandidate[] = [];
  const seen = new WeakSet<HTMLInputElement>();
  for (const form of Array.from(doc.querySelectorAll<HTMLFormElement>("form"))) {
    if (!isVisible(form)) continue;
    const email = findEmailLikeInput(form);
    if (email) seen.add(email);
    out.push({ form, emailField: email });
  }
  // Form-less fallback: look for any email input not inside a <form>
  const looseEmail = Array.from(doc.querySelectorAll<HTMLInputElement>("input"))
    .find((i) => !seen.has(i) && !i.closest("form") && isVisible(i) && (i.type === "email" || EMAIL_FIELD_HINT.test(`${i.name} ${i.id} ${i.placeholder}`)));
  if (looseEmail) {
    // Narrow container to semantic ancestors; `div` is excluded because it is too broad.
    let container = looseEmail.closest(
      "form, [role='form'], [aria-labelledby], section, main, article"
    ) as HTMLElement | null;
    if (!container) {
      // Fallback: nearest ancestor with at most 2 extra inputs beyond the email field (bounded scope).
      let node: HTMLElement | null = looseEmail.parentElement;
      while (node && node !== doc.body) {
        const extra = node.querySelectorAll("input").length - 1;
        if (extra <= 2) {
          container = node;
          break;
        }
        node = node.parentElement;
      }
    }
    out.push({ form: container ?? doc.body, emailField: looseEmail });
  }
  return out;
}
