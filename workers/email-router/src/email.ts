import PostalMime from "postal-mime";
import type { Env, AliasRecord } from "./types/env.js";
import type { DoPushPayload } from "./types/messages.js";
import { extractOtp } from "./parser/otp.js";
import { extractLinks } from "./parser/links.js";
import { htmlToText } from "./parser/html.js";
import { sanitizeDoPayload } from "./lib/sanitize.js";

// IMP-4: DI seam for testability and M4 telemetry. Minimal structural type
// matching the subset of postal-mime's ParsedEmail we actually use — kept
// inline to avoid a new file. Extend cautiously; anything added here must
// remain a privacy-safe field per ARCHITECTURE.md §6.
export interface ParsedEmailLike {
  html?: string;
  text?: string;
}

// IMP-4: DI seam for testability and M4 telemetry. Callers may inject a
// custom parser (e.g. for fault injection or telemetry wrapping). Default
// remains `PostalMime.parse`. The raw stream type mirrors what the Workers
// runtime hands us on `ForwardableEmailMessage.raw`.
export interface HandleEmailDeps {
  parseEmail?: (raw: ReadableStream<Uint8Array>) => Promise<ParsedEmailLike>;
}

// O1: Guard against CPU/memory pressure from very large HTML emails.
// OTP codes and verify links always appear near the top of a transactional
// email, so truncating to these limits loses nothing useful in practice.
const MAX_HTML_CHARS = 200_000;  // ~200 KB of HTML
const MAX_TEXT_CHARS = 50_000;   // ~50 KB of plain text

/**
 * Cloudflare Email Worker handler.
 *
 * Privacy invariants enforced here:
 *   - msg.raw is consumed once into postal-mime, the resulting `parsed`
 *     object is bound to LOCAL `const`s and never leaves this scope.
 *   - The only thing that leaves this function is `DoPushPayload`, which
 *     is run through `sanitizeDoPayload` immediately before fetch.
 *   - DKIM-failed mail is dropped silently.
 *   - Unknown / expired aliases are dropped silently.
 */
export async function handleEmail(
  msg: ForwardableEmailMessage,
  env: Env,
  _ctx: ExecutionContext,
  deps: HandleEmailDeps = {},
): Promise<void> {
  // 1. DKIM gate. Per ARCHITECTURE.md §5: drop silently on dkim=fail.
  const authResults = msg.headers.get("authentication-results");
  if (authResults && /dkim=fail/i.test(authResults)) {
    return;
  }

  // 2. Alias validity gate.
  const localPart = msg.to.split("@")[0]?.toLowerCase();
  if (!localPart) return;

  const record = await env.ALIAS_KV.get<AliasRecord>(`alias:${localPart}`, "json");
  if (!record) return;
  if (record.expiresAt !== null && record.expiresAt < Date.now()) return;

  // FIX-6 [MEDIUM-7]: parse + extract + DO push must NEVER throw out of this
  // handler. If postal-mime chokes on malformed input we silently drop —
  // bouncing would leak the existence of the alias to the sender. The catch
  // block intentionally logs only a constant string; no err.message, no
  // headers, no body content, no alias id.
  // IMP-4: DI seam for testability and M4 telemetry. Defaults to
  // PostalMime.parse; tests / telemetry wrappers may substitute.
  const parse = deps.parseEmail ?? ((raw: ReadableStream<Uint8Array>) => PostalMime.parse(raw));

  try {
    // 3. Parse via postal-mime. The raw stream is consumed here and never
    //    referenced again. parsed.html / parsed.text are local consts.
    const parsed = await parse(msg.raw);

    // 4. Build text view for OTP scanning. Prefer text/plain; fall back to
    //    HTML→text conversion. Both views stay local.
    // O1: Truncate oversized inputs before any regex work to prevent CPU spikes.
    const rawHtml = parsed.html
      ? parsed.html.slice(0, MAX_HTML_CHARS)
      : undefined;
    const rawText = parsed.text
      ? parsed.text.slice(0, MAX_TEXT_CHARS)
      : undefined;
    const textView: string = rawText ?? htmlToText(rawHtml ?? "");

    // 5. Extract.
    const otp = extractOtp(textView);
    const verifyLinks = extractLinks(rawHtml ?? "", rawText ?? "");

    // 6. Build whitelisted payload. The raw `parsed` object is intentionally
    //    NOT spread anywhere. We construct an object literal with only the
    //    four allowed keys.
    const payload: DoPushPayload = {
      receivedAt: Date.now(),
      ...(otp ? { otp: otp.code, confidence: otp.confidence } : {}),
      ...(verifyLinks.length > 0 ? { verifyLinks } : {}),
    };

    // Defence in depth: re-sanitise even though we built it manually.
    const safe = sanitizeDoPayload(payload);

    // 7. Push to AliasChannel DO.
    const id = env.MSG_DO.idFromName(localPart);
    const stub = env.MSG_DO.get(id);
    await stub.fetch("https://do.internal/push", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(safe),
    });

    // parsed, textView, msg.raw all go out of scope here → eligible for GC.
    // Nothing else references them.
  } catch {
    // Silent drop: do NOT bounce, do NOT leak. The constant string below is
    // the ONLY thing logged — no interpolation of err, msg, headers, or alias.
    console.warn("email_parse_failed");
    return;
  }
}
