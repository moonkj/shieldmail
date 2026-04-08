/**
 * Typed chrome.runtime.sendMessage wrapper with timeout and safe error handling.
 *
 * Never throws into the content-script main flow — always resolves with a
 * typed {ok, error} shape. Privacy: caller must not include DOM fragments,
 * form HTML, or field values beyond what is strictly necessary.
 */

import type { RuntimeMessage } from "../lib/types";

export interface BridgeError {
  ok: false;
  error: string;
}

export type BridgeResponse<R> = R | BridgeError;

const DEFAULT_TIMEOUT_MS = 8_000;

export function sendMessage<R = unknown>(
  msg: RuntimeMessage,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<BridgeResponse<R>> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (res: BridgeResponse<R>): void => {
      if (done) return;
      done = true;
      resolve(res);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, error: "timeout" });
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage(msg, (response: unknown) => {
        clearTimeout(timer);
        const err = chrome.runtime.lastError;
        if (err) {
          finish({ ok: false, error: err.message ?? "runtime_error" });
          return;
        }
        if (response == null) {
          finish({ ok: false, error: "empty_response" });
          return;
        }
        finish(response as R);
      });
    } catch (e) {
      clearTimeout(timer);
      finish({
        ok: false,
        error: e instanceof Error ? e.message : "send_failed",
      });
    }
  });
}
