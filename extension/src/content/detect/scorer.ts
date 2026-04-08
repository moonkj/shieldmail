/**
 * Multi-gate scorer combining 12 signals.
 * Gate A: email-like field must exist.
 * Gate B: S11 hard reject overrides everything.
 * Gate C: require >= 2 distinct categories among {URL, TEXT, STRUCT}; else score *= 0.5.
 * Adds multi-step signup boost (+0.15) if sessionStorage intent key present.
 */

import { findEmailLikeInput } from "./forms";
import { ALL_SIGNALS, SignalCategory, SignalResult } from "./signals";

export const ACTIVATION_THRESHOLD = 0.7;
const RECENT_INTENT_KEY = "shieldmail:recentSignupIntent";
const INTENT_TTL_MS = 10 * 60 * 1000;
const INTENT_BOOST = 0.15;

export interface ScoreResult {
  score: number;
  reject: boolean;
  emailField: HTMLInputElement | null;
  matched: SignalResult[];
  categories: SignalCategory[];
  activated: boolean;
}

export interface ScoreOptions {
  threshold?: number;
}

export function evaluateForm(
  form: HTMLFormElement | HTMLElement,
  doc: Document = form.ownerDocument ?? document,
  opts: ScoreOptions = {}
): ScoreResult {
  const threshold = opts.threshold ?? ACTIVATION_THRESHOLD;
  const emailField = findEmailLikeInput(form);

  // Gate A
  if (!emailField) {
    return {
      score: 0,
      reject: false,
      emailField: null,
      matched: [],
      categories: [],
      activated: false,
    };
  }

  const ctx = { doc, location: doc.defaultView?.location ?? location, form };
  const results = ALL_SIGNALS.map((fn) => fn(ctx));

  // Gate B — hard reject
  const hardReject = results.find((r) => r.hardReject);
  if (hardReject) {
    return {
      score: 0,
      reject: true,
      emailField,
      matched: [hardReject],
      categories: [],
      activated: false,
    };
  }

  // Sum positive + negative weighted signals (excluding S11 which was the reject gate)
  const matched = results.filter((r) => r.matched && r.id !== "S11");
  let score = matched.reduce((acc, r) => acc + r.weight, 0);

  // Gate C — category diversity
  const positiveCats = new Set<SignalCategory>(
    matched.filter((r) => r.weight > 0).map((r) => r.category)
  );
  if (positiveCats.size < 2) {
    score *= 0.5;
  }

  // Multi-step signup boost
  if (readRecentIntent(doc)) {
    score += INTENT_BOOST;
  }

  score = Math.max(0, Math.min(1, score));
  const activated = score >= threshold;

  if (activated) writeRecentIntent(doc);

  return {
    score,
    reject: false,
    emailField,
    matched,
    categories: Array.from(positiveCats),
    activated,
  };
}

/* ------------------ sessionStorage intent (same-origin TTL) ------------------ */

interface IntentRecord {
  origin: string;
  ts: number;
}

function readRecentIntent(doc: Document): boolean {
  try {
    const raw = doc.defaultView?.sessionStorage.getItem(RECENT_INTENT_KEY);
    if (!raw) return false;
    const rec = JSON.parse(raw) as IntentRecord;
    if (rec.origin !== (doc.defaultView?.location.origin ?? "")) return false;
    if (Date.now() - rec.ts > INTENT_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

function writeRecentIntent(doc: Document): void {
  try {
    const rec: IntentRecord = {
      origin: doc.defaultView?.location.origin ?? "",
      ts: Date.now(),
    };
    doc.defaultView?.sessionStorage.setItem(RECENT_INTENT_KEY, JSON.stringify(rec));
  } catch {
    /* ignore quota/denied */
  }
}
