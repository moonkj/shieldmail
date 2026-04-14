/**
 * OTP extraction.
 *
 * Implements ARCHITECTURE.md §5 OTP rules:
 *   - Multi-pattern: \d{6}, \d{4}, \d{3}[-\s]?\d{3}, [A-Z0-9]{6,8}, \d{8}
 *   - ±60 char context window keyword scoring
 *   - Positive keywords (KO/EN): +10..+8
 *   - Negative keywords (order/price/phone/date/amount): -8
 *   - Year guard: ^(19|20)\d{2}$ excluded
 *   - Confirmed iff score >= 5
 *   - confidence = clamp(score/20, 0, 1)
 *
 * Pure function. Safe to call from anywhere.
 */

export interface OtpResult {
  code: string;
  confidence: number;
}

interface Candidate {
  raw: string;
  normalised: string;
  index: number;
  patternBonus: number;
}

const PATTERNS: ReadonlyArray<{ re: RegExp; bonus: number }> = [
  // 6-digit (most common)
  { re: /\b\d{6}\b/g, bonus: 3 },
  // 3-3 split: 123-456 / 123 456
  { re: /\b\d{3}[-\s]\d{3}\b/g, bonus: 3 },
  // Spaced-out 6 digits: "1 2 3 4 5 6" (Canva, etc.)
  { re: /(?<!\d)\d(?:\s\d){5}(?!\s?\d)/g, bonus: 3 },
  // 8-digit
  { re: /\b\d{8}\b/g, bonus: 2 },
  // Alphanumeric 6-8
  { re: /\b[A-Z0-9]{6,8}\b/g, bonus: 2 },
  // Hyphenated alphanumeric: XFL-W3D, AB1-2CD (Slack, etc.)
  { re: /\b[A-Z0-9]{2,4}-[A-Z0-9]{2,4}\b/g, bonus: 3 },
  // 4-digit (lowest priority)
  { re: /\b\d{4}\b/g, bonus: 1 },
];

// IMP-2 [B-1]: The scorer is additive over POSITIVE_KEYWORDS entries. To
// support bare "code" without double-counting against compound forms like
// "verification code" / "code is", we mark compound entries that already
// contain the word "code" with `containsCode: true`. When any such compound
// matches in the window, the standalone `\bcode\b` entry (marked with
// `standaloneCode: true`) is skipped. See scoreCandidate() for the guard.
interface PositiveKeyword {
  re: RegExp;
  weight: number;
  containsCode?: boolean;
  standaloneCode?: boolean;
}

const POSITIVE_KEYWORDS: ReadonlyArray<PositiveKeyword> = [
  { re: /verification\s*code/i, weight: 10, containsCode: true },
  { re: /code\s*is/i, weight: 10, containsCode: true },
  { re: /one[\s-]?time\s*(?:password|code|pin)/i, weight: 10, containsCode: true },
  { re: /\botp\b/i, weight: 10 },
  { re: /security\s*code/i, weight: 9, containsCode: true },
  { re: /\bverify\b/i, weight: 8 },
  { re: /\bconfirm(?:ation)?\b/i, weight: 8 },
  { re: /authentication\s*code/i, weight: 9, containsCode: true },
  { re: /access\s*code/i, weight: 8, containsCode: true },
  { re: /pin\s*code/i, weight: 8, containsCode: true },
  // IMP-2 [B-1]: standalone `code` — lower weight than compound forms,
  // suppressed when any compound form already matched (see scoreCandidate).
  { re: /\bcode\b/i, weight: 6, standaloneCode: true },
  // Korean
  { re: /인증\s*(?:번호|코드)?/, weight: 10, containsCode: true },
  { re: /확인\s*(?:번호|코드)?/, weight: 9, containsCode: true },
  { re: /비밀번호/, weight: 8 },
  { re: /본인\s*확인/, weight: 9 },
  // Standalone Korean "코드" — same role as English standalone "code".
  { re: /코드/, weight: 6, standaloneCode: true },
  // IMP-1 [B-3]: multilang OTP keyword expansion (CJK).
  // Covers Simplified/Traditional Chinese and Japanese OTP phrases per
  // ARCHITECTURE.md §5 multilang spec. Each entry mirrors the +10 weight
  // used for Korean 인증번호 / English verification code.
  { re: /验证码/, weight: 10 },                          // 中文 (Simplified)
  { re: /驗證碼/, weight: 10 },                          // 中文 (Traditional)
  { re: /確認\s*コード/, weight: 10 },                    // 日本語
  { re: /認証\s*(?:番号|コード)/, weight: 10 },           // 日本語 variant
];

const NEGATIVE_KEYWORDS: ReadonlyArray<{ re: RegExp; weight: number }> = [
  { re: /\border\b/i, weight: -8 },
  { re: /\bprice\b/i, weight: -8 },
  { re: /\bphone\b/i, weight: -8 },
  { re: /\bdate\b/i, weight: -8 },
  { re: /\bamount\b/i, weight: -8 },
  { re: /\binvoice\b/i, weight: -8 },
  { re: /\btracking\b/i, weight: -6 },
  { re: /\bzip\b/i, weight: -6 },
  { re: /\$\d/, weight: -8 },
  { re: /₩\d/, weight: -8 },
  { re: /주문/, weight: -8 },
  { re: /금액/, weight: -8 },
  { re: /가격/, weight: -8 },
];

const YEAR_RE = /^(?:19|20)\d{2}$/;
// FIX-1 [HIGH-2]: dedicated 8-digit date-shape guard. A "verification code"
// keyword nearby (+10) can outweigh the -8 "date" negative; we must reject
// concatenated dates like 20240331 outright before scoring.
const DATE8_RE = /^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/;
const CONFIRM_THRESHOLD = 5;

export function extractOtp(text: string | null | undefined): OtpResult | null {
  if (!text) return null;
  const normalised = normaliseForScan(text);
  const candidates = collectCandidates(normalised);
  if (candidates.length === 0) return null;

  let best: { code: string; score: number } | null = null;
  const seen = new Set<string>();
  // FIX-1 [HIGH-2]: if the same code-string is flagged as a date by ANY
  // pattern's view of it, the candidate is rejected globally — even if
  // another pattern would have accepted it.
  const skipCandidate = new Set<string>();

  // First pass: mark date-shaped strings.
  for (const cand of candidates) {
    if (/^\d{4}$/.test(cand.normalised) && YEAR_RE.test(cand.normalised)) {
      skipCandidate.add(cand.normalised);
      continue;
    }
    if (/^\d{8}$/.test(cand.normalised) && DATE8_RE.test(cand.normalised)) {
      skipCandidate.add(cand.normalised);
      continue;
    }
    // 6-digit YYYYMM edge case: reject if it parses as a valid year-month
    // (e.g. "202403" embedded in a date-like context).
    if (
      /^\d{6}$/.test(cand.normalised) &&
      /^(?:19|20)\d{2}(?:0[1-9]|1[0-2])$/.test(cand.normalised)
    ) {
      skipCandidate.add(cand.normalised);
    }
  }

  for (const cand of candidates) {
    if (seen.has(cand.normalised)) continue;
    seen.add(cand.normalised);

    if (skipCandidate.has(cand.normalised)) continue;

    const score = scoreCandidate(normalised, cand);
    if (score >= CONFIRM_THRESHOLD && (best === null || score > best.score)) {
      best = { code: cand.normalised, score };
    }
  }

  if (best === null) {
    // Fallback: keyword-anchor extraction. Find verification keywords first,
    // then grab the nearest code-like token. Handles any format (XFL-W3D,
    // ab12-cd34, ABCDEF, etc.) without specific pattern rules.
    const fallback = keywordAnchorExtract(normalised);
    if (fallback) return fallback;
    return null;
  }
  const confidence = Math.max(0, Math.min(1, best.score / 20));
  return { code: best.code, confidence };
}

/**
 * Keyword-anchor fallback: scan for verification keywords, then extract
 * the nearest standalone code-like token (3-10 chars, has a digit or is
 * all-uppercase, not a URL/email/common word).
 */
const ANCHOR_KEYWORDS = [
  /verification\s*code/i, /code\s*is/i, /your\s*code/i,
  /one[\s-]?time/i, /\botp\b/i, /security\s*code/i,
  /인증\s*코드/, /확인\s*코드/, /인증\s*번호/, /코드는/,
  /코드가/, /코드를/, /\bcode[:\s]/i, /验证码/, /驗證碼/,
  /確認\s*コード/, /認証\s*(?:番号|コード)/,
];

// Matches standalone tokens that look like verification codes.
// Must contain at least one digit, or be all uppercase letters.
const CODE_TOKEN_RE = /\b[A-Z0-9][A-Z0-9\-]{1,8}[A-Z0-9]\b/gi;

const REJECT_TOKEN_RE =
  /^(?:https?|www\.|[a-z]+\.[a-z]{2,}|the|and|for|not|you|this|that|with|from|have|are|was|been|will|your|has|com|org|net|edu|http)$/i;

function keywordAnchorExtract(text: string): OtpResult | null {
  for (const kw of ANCHOR_KEYWORDS) {
    const kwMatch = kw.exec(text);
    if (!kwMatch) continue;
    const kwIndex = kwMatch.index;
    // Scan ±120 chars around the keyword.
    const start = Math.max(0, kwIndex - 120);
    const end = Math.min(text.length, kwIndex + kwMatch[0].length + 120);
    const window = text.slice(start, end);

    CODE_TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    let bestToken: { code: string; distance: number } | null = null;
    while ((m = CODE_TOKEN_RE.exec(window)) !== null) {
      const token = m[0]!;
      const normalised = token.replace(/[\s-]/g, "");
      // Must have at least one digit, OR be all uppercase 3+ chars.
      const hasDigit = /\d/.test(normalised);
      const allUpper = /^[A-Z]{3,}$/.test(normalised);
      if (!hasDigit && !allUpper) continue;
      // Reject common words, URLs.
      if (REJECT_TOKEN_RE.test(normalised)) continue;
      // Reject date-like numbers.
      if (YEAR_RE.test(normalised) || DATE8_RE.test(normalised)) continue;
      // 6-digit YYYYMM guard (e.g. "202403")
      if (/^\d{6}$/.test(normalised) && /^(?:19|20)\d{2}(?:0[1-9]|1[0-2])$/.test(normalised)) continue;
      // Prefer the token closest to the keyword.
      const dist = Math.abs(m.index - (kwIndex - start));
      if (!bestToken || dist < bestToken.distance) {
        bestToken = { code: token, distance: dist };
      }
    }
    if (bestToken) {
      return { code: bestToken.code, confidence: 0.7 };
    }
  }
  return null;
}

function normaliseForScan(text: string): string {
  // Drop zero-width chars; preserve case for [A-Z0-9] patterns.
  return text.replace(/[\u200B-\u200D\uFEFF]/g, "");
}

function collectCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  for (const { re, bonus } of PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const raw: string | undefined = m[0];
      if (raw === undefined) continue;
      const normalised = raw.replace(/[\s-]/g, "");
      out.push({ raw, normalised, index: m.index, patternBonus: bonus });
    }
  }
  return out;
}

function scoreCandidate(text: string, cand: Candidate): number {
  const start = Math.max(0, cand.index - 60);
  const end = Math.min(text.length, cand.index + cand.raw.length + 60);
  const window = text.slice(start, end);

  let score = cand.patternBonus;

  // IMP-2 [B-1]: Two-pass scoring. First pass records which compound
  // "code" phrases matched so that the standalone `\bcode\b` entry can be
  // suppressed (it already lives inside the compound and must not double
  // count). Second pass applies weights.
  let compoundCodeMatched = false;
  const matched: boolean[] = new Array(POSITIVE_KEYWORDS.length);
  for (let i = 0; i < POSITIVE_KEYWORDS.length; i++) {
    const entry = POSITIVE_KEYWORDS[i]!;
    const hit = entry.re.test(window);
    matched[i] = hit;
    if (hit && entry.containsCode) compoundCodeMatched = true;
  }

  for (let i = 0; i < POSITIVE_KEYWORDS.length; i++) {
    if (!matched[i]) continue;
    const entry = POSITIVE_KEYWORDS[i]!;
    // Skip standalone `code` when a compound form already matched — avoids
    // double-counting "verification code" + "code" in the same window.
    if (entry.standaloneCode && compoundCodeMatched) continue;
    score += entry.weight;
  }

  for (const { re, weight } of NEGATIVE_KEYWORDS) {
    if (re.test(window)) score += weight;
  }
  return score;
}
