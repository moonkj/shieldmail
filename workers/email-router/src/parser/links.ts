/**
 * Verification link extraction.
 *
 * Per ARCHITECTURE.md §5:
 *   - <a href> from HTML preferred, plaintext fallback
 *   - https: only; javascript:/data:/http: rejected
 *   - Strip tracking params: utm_*, fbclid, gclid, mc_*, _hs*
 *   - Rank by keyword: verify|confirm|activate|validate|인증|확인|auth|magic
 *   - Return top 3 unique
 */

// FIX-2 [HIGH-3]: Tracking params stripped from verify links.
// Covered patterns:
//   - utm_*           (Google Analytics: utm_source, utm_medium, ...)
//   - fbclid          (Facebook click id, exact)
//   - gclid           (Google click id, exact)
//   - mc_*            (Mailchimp: mc_cid, mc_eid, ...)
//   - _hs*            (HubSpot single-underscore: _hsenc, _hsmi, ...)
//   - __hs*           (HubSpot double-underscore: __hssc, __hstc, __hsfp)
// Note: anchored on both ends to avoid over-matching unrelated params
// like `hs_mode` or a bare `_`.
const TRACKING_PARAM_RE =
  /^(?:utm_[a-z_]+|fbclid|gclid|mc_[a-z]+|_+hs[a-z]*|__hs[a-z]+)$/i;

const KEYWORD_RE = /verify|confirm|activate|validate|auth|magic|인증|확인/i;

const A_HREF_RE = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

interface Candidate {
  url: string;          // cleaned
  anchorText: string;   // for keyword bonus
}

export function extractLinks(html: string | null | undefined, text: string | null | undefined): string[] {
  const cands: Candidate[] = [];

  if (html) {
    A_HREF_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = A_HREF_RE.exec(html)) !== null) {
      const href = m[1] ?? "";
      const anchorRaw = m[2] ?? "";
      const cleaned = cleanUrl(href);
      if (cleaned !== null) {
        cands.push({ url: cleaned, anchorText: stripTags(anchorRaw) });
      }
    }
  }

  if (text) {
    URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = URL_RE.exec(text)) !== null) {
      const matched: string | undefined = m[0];
      if (matched === undefined) continue;
      const cleaned = cleanUrl(matched);
      if (cleaned !== null) {
        cands.push({ url: cleaned, anchorText: "" });
      }
    }
  }

  // Dedup by cleaned URL, keeping the entry with stronger keyword signal.
  const byUrl = new Map<string, { score: number }>();
  for (const c of cands) {
    const score = rankCandidate(c);
    const existing = byUrl.get(c.url);
    if (!existing || score > existing.score) {
      byUrl.set(c.url, { score });
    }
  }

  return Array.from(byUrl.entries())
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 3)
    .map(([url]) => url);
}

function rankCandidate(c: Candidate): number {
  let score = 0;
  if (KEYWORD_RE.test(c.url)) score += 3;
  if (c.anchorText && KEYWORD_RE.test(c.anchorText)) score += 4;
  // Slight preference for shorter URLs after cleaning (less noise).
  score += Math.max(0, 5 - Math.floor(c.url.length / 80));
  return score;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Returns a normalised https-only URL string with tracking params stripped,
 * or null if rejected.
 */
export function cleanUrl(raw: string): string | null {
  if (!raw) return null;
  let candidate = raw.trim();

  // Trim trailing punctuation that often follows urls in plaintext.
  candidate = candidate.replace(/[).,;:!?]+$/g, "");

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;

  // Strip tracking params.
  const toDelete: string[] = [];
  url.searchParams.forEach((_value, key) => {
    if (TRACKING_PARAM_RE.test(key)) toDelete.push(key);
  });
  for (const key of toDelete) url.searchParams.delete(key);

  // Drop fragment if it's only a tracker hash; keep otherwise (some links use it).
  // Conservative: keep fragment as-is.

  return url.toString();
}
