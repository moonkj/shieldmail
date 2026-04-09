// BackgroundPoller — per-alias polling session, SW eviction-safe.
//
// Schedule (success path): 2s, 2s, 2s, 4s, 6s, 10s, 10s, 10s ... capped at 10s.
// Hard stop: 2 minutes total elapsed since start.
// Error backoff: exponential capped at 30s, give up after 5 consecutive failures.
//
// State is persisted to chrome.storage.local so that if the service worker
// is evicted mid-session, it can be rehydrated via BackgroundPoller.rehydrateAll().

import type { ApiClient } from "./api.js";
import {
  ApiError,
  AliasExpiredError,
  RateLimitError,
  TokenRevokedError,
} from "./api.js";
import {
  getActivePollers,
  putPollerState,
  removeActiveAliasByAliasId,
  removePollerState,
  type PollerState,
} from "./storage.js";
import { notifyOtpArrived } from "./notify.js";
import { sendRuntime } from "../lib/messaging.js";
import type { ExtractedMessage } from "../lib/types.js";

const MAX_SESSION_MS = 2 * 60 * 1000;
const MAX_FAILURES = 5;
const ERROR_BACKOFF_CAP_MS = 30_000;
const SUCCESS_SCHEDULE_MS = [2_000, 2_000, 2_000, 4_000, 6_000, 10_000];
const SUCCESS_TAIL_MS = 10_000;
// Hot-path setTimeout only fires during the first SW-warm window.
const HOT_PATH_WINDOW_MS = 6_000;
const ALARM_PREFIX = "sm-poll-";
// NOTE: chrome.alarms minimum period is 30s in production (Chrome clamps
// periodInMinutes < 0.5). In unpacked/dev builds 0.1min (6s) works. For M4 we
// will switch to an SSE /stream endpoint; until then production polling
// cadence is effectively coarser than the success schedule below.
const ALARM_DELAY_MIN = 0.05; // ~3s
const ALARM_PERIOD_MIN = 0.1; // ~6s (dev); clamped to 30s in production

function alarmName(aliasId: string): string {
  return ALARM_PREFIX + aliasId;
}

function nextSuccessDelay(attempt: number): number {
  return SUCCESS_SCHEDULE_MS[attempt] ?? SUCCESS_TAIL_MS;
}

export class BackgroundPoller {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private addressByAlias = new Map<string, string>();
  private active = new Set<string>();

  constructor(private api: ApiClient) {}

  async start(
    aliasId: string,
    pollToken: string,
    aliasAddress?: string,
  ): Promise<void> {
    if (aliasAddress) this.addressByAlias.set(aliasId, aliasAddress);
    const state: PollerState = {
      aliasId,
      pollToken,
      startedAt: Date.now(),
      nextPollAt: Date.now() + (SUCCESS_SCHEDULE_MS[0] ?? 2_000),
      attempt: 0,
      consecutiveFailures: 0,
      lastSince: 0,
    };
    await putPollerState(state);
    this.active.add(aliasId);
    // Primary wakeup: chrome.alarms (survives SW eviction).
    try {
      await chrome.alarms.clear(alarmName(aliasId));
    } catch {
      /* ignore */
    }
    chrome.alarms.create(alarmName(aliasId), {
      delayInMinutes: ALARM_DELAY_MIN,
      periodInMinutes: ALARM_PERIOD_MIN,
    });
    // Hot-path fast timer only during the initial SW-warm window.
    this.scheduleHot(state);
  }

  async stop(aliasId: string): Promise<void> {
    const t = this.timers.get(aliasId);
    if (t) clearTimeout(t);
    this.timers.delete(aliasId);
    this.addressByAlias.delete(aliasId);
    this.active.delete(aliasId);
    try {
      await chrome.alarms.clear(alarmName(aliasId));
    } catch {
      /* ignore */
    }
    await removePollerState(aliasId);
  }

  /** Rehydrate any in-flight pollers after SW wakeup. */
  async rehydrateAll(): Promise<void> {
    const map = await getActivePollers();
    const now = Date.now();
    for (const state of Object.values(map)) {
      if (now - state.startedAt >= MAX_SESSION_MS) {
        await removePollerState(state.aliasId);
        try {
          await chrome.alarms.clear(alarmName(state.aliasId));
        } catch {
          /* ignore */
        }
        continue;
      }
      // Skip duplicates already tracked in-memory.
      if (this.active.has(state.aliasId)) continue;
      this.active.add(state.aliasId);
      // Clear any stale alarm, then recreate so cadence is deterministic.
      try {
        await chrome.alarms.clear(alarmName(state.aliasId));
      } catch {
        /* ignore */
      }
      chrome.alarms.create(alarmName(state.aliasId), {
        delayInMinutes: ALARM_DELAY_MIN,
        periodInMinutes: ALARM_PERIOD_MIN,
      });
      this.scheduleHot(state);
    }
  }

  /** Pause polling while popup holds a direct SSE connection. */
  async pauseForSse(aliasId: string): Promise<void> {
    try { await chrome.alarms.clear(alarmName(aliasId)); } catch { /* ignore */ }
    const t = this.timers.get(aliasId);
    if (t) clearTimeout(t);
    this.timers.delete(aliasId);
  }

  /** Resume alarm-based polling after SSE connection closes or fails. */
  async resumeFromSse(aliasId: string): Promise<void> {
    if (!this.active.has(aliasId)) return;
    try { await chrome.alarms.clear(alarmName(aliasId)); } catch { /* ignore */ }
    chrome.alarms.create(alarmName(aliasId), {
      delayInMinutes: ALARM_DELAY_MIN,
      periodInMinutes: ALARM_PERIOD_MIN,
    });
  }

  /** chrome.alarms dispatch target. Performs one poll iteration. */
  async onAlarm(aliasId: string): Promise<void> {
    await this.tick(aliasId);
  }

  /** Hot-path setTimeout — only fires if still within the SW-warm window. */
  private scheduleHot(state: PollerState): void {
    const now = Date.now();
    const delay = Math.max(0, state.nextPollAt - now);
    if (now - state.startedAt >= HOT_PATH_WINDOW_MS) return;
    if (delay > HOT_PATH_WINDOW_MS) return;
    const existing = this.timers.get(state.aliasId);
    if (existing) clearTimeout(existing);
    const t = setTimeout(() => {
      this.timers.delete(state.aliasId);
      void this.tick(state.aliasId);
    }, delay);
    this.timers.set(state.aliasId, t);
  }

  private async tick(aliasId: string): Promise<void> {
    const map = await getActivePollers();
    const state = map[aliasId];
    if (!state) return;

    if (Date.now() - state.startedAt >= MAX_SESSION_MS) {
      await this.stop(aliasId);
      return;
    }

    try {
      const result = await this.api.getMessages(
        state.aliasId,
        state.pollToken,
        state.lastSince || undefined,
      );

      const nextState: PollerState = {
        ...state,
        consecutiveFailures: 0,
        attempt: state.attempt + 1,
        lastSince: Date.now(),
      };

      if (result.messages.length > 0) {
        // Broadcast to popup listeners (no-op if popup closed).
        await sendRuntime({
          type: "FETCH_MESSAGES_RESULT",
          ok: true,
          messages: result.messages,
          expired: result.expired,
        });
        // Background notification if popup not open.
        const first: ExtractedMessage | undefined = result.messages[0];
        const addr = this.addressByAlias.get(aliasId) ?? aliasId;
        await notifyOtpArrived(addr, first?.otp);
      }

      if (result.expired) {
        await removeActiveAliasByAliasId(aliasId);
        await this.stop(aliasId);
        return;
      }

      nextState.nextPollAt = Date.now() + nextSuccessDelay(nextState.attempt);
      await putPollerState(nextState);
      this.scheduleHot(nextState);
    } catch (err) {
      if (err instanceof AliasExpiredError) {
        await sendRuntime({
          type: "FETCH_MESSAGES_RESULT",
          ok: false,
          error: "alias_expired",
        });
        await removeActiveAliasByAliasId(aliasId);
        await this.stop(aliasId);
        return;
      }
      if (err instanceof TokenRevokedError) {
        await sendRuntime({
          type: "FETCH_MESSAGES_RESULT",
          ok: false,
          error: "token_revoked",
        });
        await this.stop(aliasId);
        return;
      }
      // Rate limited or generic error → exponential backoff.
      const failures = state.consecutiveFailures + 1;
      if (failures >= MAX_FAILURES) {
        await this.stop(aliasId);
        return;
      }
      const base =
        err instanceof RateLimitError && err.retryAfterMs
          ? err.retryAfterMs
          : Math.min(ERROR_BACKOFF_CAP_MS, 2_000 * Math.pow(2, failures - 1));
      const nextState: PollerState = {
        ...state,
        consecutiveFailures: failures,
        nextPollAt: Date.now() + Math.min(ERROR_BACKOFF_CAP_MS, base),
      };
      await putPollerState(nextState);
      this.scheduleHot(nextState);
      // Do not log err.message — could leak URL/context.
      void (err instanceof ApiError);
    }
  }
}
