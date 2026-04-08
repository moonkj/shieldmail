// RuntimeMessage dispatch for the background service worker.
// Wraps API calls, translates errors to stable string codes,
// updates storage, and drives the poller.

import type { RuntimeMessage } from "../lib/types.js";
import type { ErrorCode } from "../lib/messaging.js";
import {
  ApiClient,
  ApiError,
  AliasExpiredError,
  NetworkError,
  RateLimitError,
  TokenRevokedError,
} from "./api.js";
import type { BackgroundPoller } from "./poller.js";
import {
  getActiveAliases,
  getManagedAliases,
  putActiveAlias,
  putManagedAlias,
  removeActiveAliasByAliasId,
  removeManagedAlias,
} from "./storage.js";
import { markGenerateAliasSeen } from "./notify.js";

function errorToCode(err: unknown): ErrorCode {
  if (err instanceof RateLimitError) return "rate_limited";
  if (err instanceof TokenRevokedError) return "token_revoked";
  if (err instanceof AliasExpiredError) return "alias_expired";
  if (err instanceof NetworkError) return "network_unavailable";
  if (err instanceof ApiError) return "unknown";
  return "unknown";
}

// DEV-ONLY demo fallback: when the real Worker is unreachable in a dev
// build, generate a local fake alias so the popup UI can be tested
// end-to-end. Constant-folded out of production builds.
// The fake alias is marked with a `demo:` prefix in pollToken so the
// FETCH_MESSAGES / ACK / DELETE handlers can recognize it.
function makeDemoAlias(mode: "ephemeral" | "managed", label?: string): import("../lib/types.js").AliasRecord {
  const rand = (): string => {
    const buf = new Uint8Array(7);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 14);
  };
  const aliasId = rand();
  const domains = ["d1.shld.me", "d2.shld.me", "d3.shld.me", "d4.shld.me", "d5.shld.me"];
  const domain = domains[Math.floor(Math.random() * domains.length)] ?? "d1.shld.me";
  return {
    aliasId,
    address: `${aliasId}@${domain}`,
    expiresAt: mode === "ephemeral" ? Date.now() + 60 * 60 * 1000 : null,
    pollToken: `demo:${aliasId}`,
    mode,
    label,
    createdAt: Date.now(),
  };
}

async function findAliasById(
  aliasId: string,
): Promise<{ pollToken: string } | undefined> {
  const active = await getActiveAliases();
  for (const rec of Object.values(active)) {
    if (rec.aliasId === aliasId) return { pollToken: rec.pollToken };
  }
  const managed = await getManagedAliases();
  const m = managed[aliasId];
  if (m) return { pollToken: m.pollToken };
  return undefined;
}

export interface HandlerDeps {
  api: ApiClient;
  poller: BackgroundPoller;
}

export async function dispatch(
  msg: RuntimeMessage,
  deps: HandlerDeps,
): Promise<unknown> {
  switch (msg.type) {
    case "GENERATE_ALIAS": {
      markGenerateAliasSeen();
      try {
        const record = await deps.api.generateAlias(msg.mode, msg.label);
        record.origin = msg.origin;
        await putActiveAlias(record);
        if (msg.mode === "managed") await putManagedAlias(record);
        await deps.poller.start(record.aliasId, record.pollToken, record.address);
        return { type: "GENERATE_ALIAS_RESULT", ok: true, record };
      } catch (err) {
        // Auth/rate-limit errors always surface as real errors.
        if (
          err instanceof RateLimitError ||
          err instanceof TokenRevokedError ||
          err instanceof AliasExpiredError
        ) {
          return {
            type: "GENERATE_ALIAS_RESULT",
            ok: false,
            error: errorToCode(err),
          };
        }
        // DEV-ONLY: if the Worker is unreachable in a dev build, hand back a
        // local fake alias so the popup UI can be exercised without backend
        // deployment. Production builds surface the real error.
        if (__SHIELDMAIL_DEV__) {
          const record = makeDemoAlias(msg.mode, msg.label);
          record.origin = msg.origin;
          await putActiveAlias(record);
          if (msg.mode === "managed") await putManagedAlias(record);
          return { type: "GENERATE_ALIAS_RESULT", ok: true, record };
        }
        return {
          type: "GENERATE_ALIAS_RESULT",
          ok: false,
          error: errorToCode(err),
        };
      }
    }
    case "FETCH_MESSAGES": {
      try {
        const found = await findAliasById(msg.aliasId);
        if (!found) {
          return {
            type: "FETCH_MESSAGES_RESULT",
            ok: false,
            error: "unknown" satisfies ErrorCode,
          };
        }
        // Demo alias: synthesize a fake OTP after a short delay so users can
        // see the full popup flow (alias → OTP → copy) without a deployed Worker.
        if (found.pollToken.startsWith("demo:")) {
          const fakeOtp = String(Math.floor(100000 + Math.random() * 900000));
          return {
            type: "FETCH_MESSAGES_RESULT",
            ok: true,
            messages: [
              {
                id: `demo-${Date.now()}`,
                otp: fakeOtp,
                confidence: 0.95,
                receivedAt: Date.now(),
                verifyLinks: ["https://demo.local/verify/demo-token"],
              },
            ],
            expired: false,
          };
        }
        const result = await deps.api.getMessages(msg.aliasId, found.pollToken);
        return {
          type: "FETCH_MESSAGES_RESULT",
          ok: true,
          messages: result.messages,
          expired: result.expired,
        };
      } catch (err) {
        return {
          type: "FETCH_MESSAGES_RESULT",
          ok: false,
          error: errorToCode(err),
        };
      }
    }
    case "ACK_MESSAGE": {
      try {
        const found = await findAliasById(msg.aliasId);
        if (!found) return { ok: false, error: "unknown" satisfies ErrorCode };
        // Demo alias: ack is a no-op (no Worker to clear).
        if (found.pollToken.startsWith("demo:")) return { ok: true };
        await deps.api.ackMessage(msg.aliasId, found.pollToken, msg.messageId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errorToCode(err) };
      }
    }
    case "DELETE_ALIAS": {
      try {
        const found = await findAliasById(msg.aliasId);
        if (found && !found.pollToken.startsWith("demo:")) {
          try {
            await deps.api.deleteAlias(msg.aliasId, found.pollToken);
          } catch {
            // Continue local cleanup even if server call fails.
          }
        }
        await deps.poller.stop(msg.aliasId);
        await removeActiveAliasByAliasId(msg.aliasId);
        await removeManagedAlias(msg.aliasId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errorToCode(err) };
      }
    }
    default:
      // Messages we don't handle in background (DETECT_RESULT, FILL_FIELD,
      // OPEN_VERIFY_LINK, *_RESULT broadcasts) are ignored here.
      return undefined;
  }
}
