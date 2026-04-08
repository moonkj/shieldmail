/**
 * Minimal HTML → plain text fallback. No external dependency.
 *
 * Used when postal-mime returns HTML but no plaintext alternative.
 * NOT a general HTML sanitiser — output is consumed only by OTP/link
 * extractors and never persisted.
 *
 * Strategy:
 *   1. Drop <script>/<style> contents entirely (case-insensitive).
 *   2. Replace <br>, </p>, </div>, </li>, <tr> with newlines.
 *   3. Strip remaining tags.
 *   4. Decode common HTML entities.
 *   5. Collapse whitespace.
 */
export function htmlToText(html: string): string {
  if (!html) return "";

  let s = html;

  // 1. Remove <script> and <style> blocks (with content).
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");

  // 2. Replace block-level tags with newlines.
  s = s.replace(/<(?:br|BR)\s*\/?>/g, "\n");
  s = s.replace(/<\/(?:p|div|li|tr|h[1-6]|section|article)\s*>/gi, "\n");
  s = s.replace(/<\/?(?:ul|ol|table|tbody|thead|nav|header|footer)\s*>/gi, "\n");

  // 3. Strip remaining tags.
  s = s.replace(/<[^>]+>/g, " ");

  // 4. Entities.
  s = decodeEntities(s);

  // 5. Whitespace collapse but preserve newlines as separators.
  s = s.replace(/[ \t\f\v]+/g, " ");
  s = s.replace(/\s*\n\s*/g, "\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.trim();

  return s;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  copy: "(c)",
  reg: "(r)",
  hellip: "...",
  mdash: "-",
  ndash: "-",
  ldquo: '"',
  rdquo: '"',
  lsquo: "'",
  rsquo: "'",
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const isHex = entity[1] === "x" || entity[1] === "X";
      const num = parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(num) && num >= 0 && num <= 0x10ffff) {
        try {
          return String.fromCodePoint(num);
        } catch {
          return match;
        }
      }
      return match;
    }
    const named = NAMED_ENTITIES[entity.toLowerCase()];
    return named ?? match;
  });
}
