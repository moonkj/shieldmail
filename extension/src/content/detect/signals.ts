/**
 * 12 detection signals (S1..S12) per ARCHITECTURE §4.
 * Each signal is a pure function returning {matched, weight, category}.
 *
 * Categories: URL | TEXT | STRUCT — consumed by Gate C (diversity).
 * S11 is a hard reject signal; S12 is an attenuation signal for newsletters.
 */

import {
  CONFIRM_PWD_TEXT,
  FORM_ACTION_URL,
  LOGIN_TEXT,
  NEWSLETTER_TEXT,
  SIGNUP_TEXT,
  SIGNUP_URL,
  SOCIAL_LOGIN_TEXT,
  TERMS_TEXT,
  VERIFY_LINK_TEXT,
} from "./keywords";

export type SignalCategory = "URL" | "TEXT" | "STRUCT";

export interface SignalResult {
  id: string;
  matched: boolean;
  weight: number;
  category: SignalCategory;
  hardReject?: boolean;
}

export interface SignalContext {
  doc: Document;
  location: Location;
  form: HTMLFormElement | HTMLElement;
}

/* ------------------------------- Signals -------------------------------- */

// S1 URL path
export function s1(ctx: SignalContext): SignalResult {
  const matched = SIGNUP_URL.test(ctx.location.pathname + ctx.location.search);
  return { id: "S1", matched, weight: 0.35, category: "URL" };
}

// S2 <title> keyword
export function s2(ctx: SignalContext): SignalResult {
  const matched = SIGNUP_TEXT.test(ctx.doc.title ?? "");
  return { id: "S2", matched, weight: 0.15, category: "TEXT" };
}

// S3 submit button text
export function s3(ctx: SignalContext): SignalResult {
  const buttons = ctx.form.querySelectorAll<HTMLElement>(
    'button, input[type="submit"], [role="button"]'
  );
  let matched = false;
  for (const b of Array.from(buttons)) {
    const label =
      (b instanceof HTMLInputElement ? b.value : "") +
      " " +
      (b.textContent ?? "") +
      " " +
      (b.getAttribute("aria-label") ?? "");
    if (SIGNUP_TEXT.test(label)) {
      matched = true;
      break;
    }
  }
  return { id: "S3", matched, weight: 0.25, category: "TEXT" };
}

// S4 password confirm field
export function s4(ctx: SignalContext): SignalResult {
  const pwd = ctx.form.querySelectorAll<HTMLInputElement>('input[type="password"]');
  if (pwd.length >= 2) return { id: "S4", matched: true, weight: 0.3, category: "STRUCT" };
  for (const p of Array.from(pwd)) {
    const hay = `${p.name} ${p.id} ${p.placeholder} ${p.getAttribute("autocomplete") ?? ""}`;
    if (CONFIRM_PWD_TEXT.test(hay)) return { id: "S4", matched: true, weight: 0.3, category: "STRUCT" };
  }
  return { id: "S4", matched: false, weight: 0.3, category: "STRUCT" };
}

// S5 terms checkbox
export function s5(ctx: SignalContext): SignalResult {
  const cbs = ctx.form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
  for (const cb of Array.from(cbs)) {
    const hay =
      (cb.name ?? "") +
      " " +
      (cb.id ?? "") +
      " " +
      (cb.getAttribute("aria-label") ?? "") +
      " " +
      (cb.closest("label")?.textContent ?? "") +
      " " +
      (cb.parentElement?.textContent ?? "");
    if (TERMS_TEXT.test(hay)) {
      return { id: "S5", matched: true, weight: 0.2, category: "STRUCT" };
    }
  }
  return { id: "S5", matched: false, weight: 0.2, category: "STRUCT" };
}

// S6 form heading (ancestor or descendant headings)
export function s6(ctx: SignalContext): SignalResult {
  // Check headings inside form and headings in form's ancestors (up to 3 levels)
  const headings = new Set<Element>();
  ctx.form.querySelectorAll("h1,h2,h3,legend").forEach((h) => headings.add(h));
  let node: Element | null = ctx.form.parentElement;
  for (let i = 0; i < 3 && node; i++) {
    node.querySelectorAll(":scope > h1, :scope > h2, :scope > h3, :scope > legend").forEach((h) => headings.add(h));
    node = node.parentElement;
  }
  for (const h of headings) {
    if (SIGNUP_TEXT.test(h.textContent ?? "")) {
      return { id: "S6", matched: true, weight: 0.15, category: "TEXT" };
    }
  }
  return { id: "S6", matched: false, weight: 0.15, category: "TEXT" };
}

// S7 form action URL
export function s7(ctx: SignalContext): SignalResult {
  if (!(ctx.form instanceof HTMLFormElement)) {
    return { id: "S7", matched: false, weight: 0.15, category: "URL" };
  }
  const action = ctx.form.action ?? "";
  return { id: "S7", matched: FORM_ACTION_URL.test(action), weight: 0.15, category: "URL" };
}

// S8 ToS/Privacy links
export function s8(ctx: SignalContext): SignalResult {
  const links = ctx.form.querySelectorAll<HTMLAnchorElement>("a[href]");
  for (const a of Array.from(links)) {
    if (TERMS_TEXT.test(`${a.href} ${a.textContent ?? ""}`)) {
      return { id: "S8", matched: true, weight: 0.1, category: "TEXT" };
    }
  }
  return { id: "S8", matched: false, weight: 0.1, category: "TEXT" };
}

// S9 verification fields / captcha iframe
export function s9(ctx: SignalContext): SignalResult {
  const iframes = ctx.form.querySelectorAll("iframe");
  for (const f of Array.from(iframes)) {
    const src = f.getAttribute("src") ?? "";
    if (/recaptcha|hcaptcha|turnstile|captcha/i.test(src)) {
      return { id: "S9", matched: true, weight: 0.1, category: "STRUCT" };
    }
  }
  const verif = ctx.form.querySelector<HTMLInputElement>(
    'input[autocomplete="one-time-code"], input[name*="otp" i], input[name*="captcha" i], input[name*="verif" i]'
  );
  return { id: "S9", matched: !!verif, weight: 0.1, category: "STRUCT" };
}

// S10 social login cluster
export function s10(ctx: SignalContext): SignalResult {
  const buttons = ctx.form.querySelectorAll<HTMLElement>('button, a[role="button"], [role="button"]');
  let count = 0;
  for (const b of Array.from(buttons)) {
    const label = (b.textContent ?? "") + " " + (b.getAttribute("aria-label") ?? "");
    if (SOCIAL_LOGIN_TEXT.test(label)) count += 1;
    if (count >= 3) break;
  }
  return { id: "S10", matched: count >= 3, weight: 0.1, category: "STRUCT" };
}

// S11 NEGATIVE: login/forgot/reset standalone → hard reject
export function s11(ctx: SignalContext): SignalResult {
  // Standalone login: LOGIN_TEXT matches AND no SIGNUP_TEXT in title/heading/buttons
  const titleSignup = SIGNUP_TEXT.test(ctx.doc.title ?? "");
  const pathSignup = SIGNUP_URL.test(ctx.location.pathname);
  if (titleSignup || pathSignup) {
    return { id: "S11", matched: false, weight: -0.4, category: "TEXT", hardReject: false };
  }
  let loginHit = LOGIN_TEXT.test(ctx.doc.title ?? "") || LOGIN_TEXT.test(ctx.location.pathname);
  if (!loginHit) {
    const buttons = ctx.form.querySelectorAll<HTMLElement>('button, input[type="submit"]');
    for (const b of Array.from(buttons)) {
      const label = (b instanceof HTMLInputElement ? b.value : "") + " " + (b.textContent ?? "");
      if (LOGIN_TEXT.test(label)) {
        loginHit = true;
        break;
      }
    }
  }
  // Also require absence of confirm-password (pure login rarely has 2 pwd fields)
  const hasTwoPwd =
    ctx.form.querySelectorAll('input[type="password"]').length >= 2;
  const matched = loginHit && !hasTwoPwd;
  return { id: "S11", matched, weight: -0.4, category: "TEXT", hardReject: matched };
}

// S12 NEGATIVE: newsletter with <= 2 fields
export function s12(ctx: SignalContext): SignalResult {
  const fieldCount = ctx.form.querySelectorAll<HTMLInputElement>(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"])'
  ).length;
  const textHay =
    (ctx.form.textContent ?? "").slice(0, 2000) +
    " " +
    (ctx.doc.title ?? "");
  const matched = NEWSLETTER_TEXT.test(textHay) && fieldCount <= 2;
  return { id: "S12", matched, weight: -0.5, category: "TEXT" };
}

export const ALL_SIGNALS = [s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12] as const;
