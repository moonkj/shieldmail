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

/** Pick the OTP result with higher confidence from text/plain vs HTML views. */
function pickBestOtp(
  a: import("./parser/otp.js").OtpResult | null,
  b: import("./parser/otp.js").OtpResult | null,
): import("./parser/otp.js").OtpResult | null {
  if (!a) return b;
  if (!b) return a;
  return a.confidence >= b.confidence ? a : b;
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
  // Minimal operational log — no PII.
  console.log(`[email] to=${msg.to.split("@")[0]}`);

  // 1. DKIM gate. Per ARCHITECTURE.md §5: drop silently on dkim=fail.
  const authResults = msg.headers.get("authentication-results");
  if (authResults && /dkim=fail/i.test(authResults)) {
    console.log("[email] dropped: dkim=fail");
    return;
  }

  // 2. Alias validity gate.
  const localPart = msg.to.split("@")[0]?.toLowerCase();
  if (!localPart) { console.log("[email] dropped: no localPart"); return; }

  const record = await env.ALIAS_KV.get<AliasRecord>(`alias:${localPart}`, "json");
  if (!record) { console.log(`[email] dropped: alias not found in KV for ${localPart}`); return; }
  if (record.expiresAt !== null && record.expiresAt < Date.now()) {
    console.log(`[email] dropped: alias expired (expiresAt=${record.expiresAt} now=${Date.now()})`);
    return;
  }
  console.log(`[email] alias valid, mode=${record.mode}`);

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

    // 4. Build text views for OTP scanning.
    // O1: Truncate oversized inputs before any regex work to prevent CPU spikes.
    const rawHtml = parsed.html
      ? parsed.html.slice(0, MAX_HTML_CHARS)
      : undefined;
    const rawText = parsed.text
      ? parsed.text.slice(0, MAX_TEXT_CHARS)
      : undefined;
    const htmlText = htmlToText(rawHtml ?? "");
    // Scan BOTH text/plain and HTML→text views — many services (Canva, etc.)
    // include the OTP code only in the HTML part, not in text/plain.
    const otpFromText = rawText ? extractOtp(rawText) : null;
    const otpFromHtml = htmlText ? extractOtp(htmlText) : null;
    const otp = pickBestOtp(otpFromText, otpFromHtml);
    const textView = rawText ?? htmlText;

    // 5. Extract links from both views.
    const verifyLinks = extractLinks(rawHtml ?? "", rawText ?? "");
    console.log(`[email] otp=${otp?.code ?? "none"} links=${verifyLinks.length}`);

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

    console.log("[email] DO push succeeded");
    // parsed, textView, msg.raw all go out of scope here → eligible for GC.
    // Nothing else references them.
  } catch (e) {
    // Silent drop: do NOT bounce, do NOT leak.
    console.warn(`[email] processing_failed: ${e instanceof Error ? e.message : "unknown"}`);
    return;
  }
}
