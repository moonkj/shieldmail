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
        await deps.api.ackMessage(msg.aliasId, found.pollToken, msg.messageId);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: errorToCode(err) };
      }
    }
    case "DELETE_ALIAS": {
      try {
        const found = await findAliasById(msg.aliasId);
        if (found) {
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
