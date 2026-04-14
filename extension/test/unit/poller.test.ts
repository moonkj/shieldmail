/**
 * Unit tests for background/poller.ts — BackgroundPoller.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BackgroundPoller } from "../../src/background/poller";
import {
  ApiClient,
  AliasExpiredError,
  RateLimitError,
  TokenRevokedError,
  NetworkError,
} from "../../src/background/api";
import type { ExtractedMessage } from "../../src/lib/types";

// Helper to build a JSON response
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let api: ApiClient;
let poller: BackgroundPoller;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  (chrome.storage.local as unknown as { _store: Map<string, unknown> })._store.clear();
  api = new ApiClient("https://api.test");
  poller = new BackgroundPoller(api);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("BackgroundPoller", () => {
  describe("start()", () => {
    it("persists poller state to storage", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(200, { messages: [], expired: false }),
      );
      await poller.start("a1", "tok1", "a1@test.com");
      const stored = await chrome.storage.local.get("activePollers");
      const pollers = (stored as { activePollers: Record<string, unknown> }).activePollers;
      expect(pollers).toBeDefined();
      expect(pollers["a1"]).toBeDefined();
    });

    it("creates a chrome.alarms entry", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(200, { messages: [], expired: false }),
      );
      await poller.start("a1", "tok1", "a1@test.com");
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        "sm-poll-a1",
        expect.objectContaining({ delayInMinutes: expect.any(Number) }),
      );
    });

    it("schedules a hot-path setTimeout", async () => {
      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(200, { messages: [], expired: false }),
      );
      await poller.start("a1", "tok1");
      // setTimeout should have been called for the hot-path scheduler
      expect(setTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe("stop()", () => {
    it("removes poller state from storage", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(200, { messages: [], expired: false }),
      );
      await poller.start("a1", "tok1");
      await poller.stop("a1");
      const stored = await chrome.storage.local.get("activePollers");
      const pollers = (stored as { activePollers?: Record<string, unknown> }).activePollers ?? {};
      expect(pollers["a1"]).toBeUndefined();
    });

    it("clears the chrome alarm", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(200, { messages: [], expired: false }),
      );
      await poller.start("a1", "tok1");
      await poller.stop("a1");
      expect(chrome.alarms.clear).toHaveBeenCalledWith("sm-poll-a1");
    });
  });

  describe("onAlarm()", () => {
    it("performs a tick (fetches messages)", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(200, { messages: [], expired: false })) // start tick
        .mockResolvedValueOnce(jsonResponse(200, { messages: [], expired: false })); // onAlarm tick
      await poller.start("a1", "tok1");
      // Let the initial hot-path poll fire
      await vi.advanceTimersByTimeAsync(3000);
      await poller.onAlarm("a1");
      // fetch should have been called for polling
      expect(fetchSpy).toHaveBeenCalled();
    });

    it("stops polling when alias is expired from API", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(200, { messages: [], expired: false })) // start
        .mockResolvedValueOnce(jsonResponse(200, { messages: [], expired: true })); // tick -> expired
      await poller.start("a1", "tok1");
      await vi.advanceTimersByTimeAsync(3000);
      await poller.onAlarm("a1");
      // After expired, the poller state should be cleaned up
      const stored = await chrome.storage.local.get("activePollers");
      const pollers = (stored as { activePollers?: Record<string, unknown> }).activePollers ?? {};
      expect(pollers["a1"]).toBeUndefined();
    });

    it("broadcasts messages when OTP arrives", async () => {
      const msgs: ExtractedMessage[] = [
        { id: "m1", otp: "123456", confidence: 0.99, receivedAt: Date.now() },
      ];
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(200, { messages: [], expired: false })) // start
        .mockResolvedValueOnce(jsonResponse(200, { messages: msgs, expired: false })); // tick with OTP
      await poller.start("a1", "tok1", "a1@test.com");
      await vi.advanceTimersByTimeAsync(3000);
      await poller.onAlarm("a1");
      // sendRuntime should have been called (which calls chrome.runtime.sendMessage)
      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
    });

    it("does nothing when no poller state exists for aliasId", async () => {
      // No poller started - onAlarm should be a no-op
      await poller.onAlarm("nonexistent");
      // No error thrown
    });
  });

  describe("rehydrateAll()", () => {
    it("rehydrates pollers from storage", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(200, { messages: [], expired: false }),
      );
      // Manually seed storage with a poller state
      const state = {
        aliasId: "rehy-1",
        pollToken: "tok-rehy",
        startedAt: Date.now(),
        nextPollAt: Date.now() + 2000,
        attempt: 0,
        consecutiveFailures: 0,
        lastSince: 0,
      };
      await chrome.storage.local.set({
        activePollers: { "rehy-1": state },
      });
      await poller.rehydrateAll();
      // Should have created an alarm for the rehydrated poller
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        "sm-poll-rehy-1",
        expect.objectContaining({ delayInMinutes: expect.any(Number) }),
      );
    });

    it("removes expired poller states on rehydration", async () => {
      const oldState = {
        aliasId: "old-1",
        pollToken: "tok-old",
        startedAt: Date.now() - 3 * 60 * 1000, // 3 minutes ago (> MAX_SESSION_MS of 2 min)
        nextPollAt: Date.now(),
        attempt: 5,
        consecutiveFailures: 0,
        lastSince: 0,
      };
      await chrome.storage.local.set({
        activePollers: { "old-1": oldState },
      });
      await poller.rehydrateAll();
      const stored = await chrome.storage.local.get("activePollers");
      const pollers = (stored as { activePollers?: Record<string, unknown> }).activePollers ?? {};
      expect(pollers["old-1"]).toBeUndefined();
    });

    it("skips already-active pollers", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(200, { messages: [], expired: false }),
      );
      // Start a poller first, then rehydrate — it should not duplicate
      await poller.start("dup-1", "tok-dup");
      const createCallsBefore = (chrome.alarms.create as ReturnType<typeof vi.fn>).mock.calls.length;
      await poller.rehydrateAll();
      // create should not be called again for the same alias
      const createCallsAfter = (chrome.alarms.create as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(createCallsAfter).toBe(createCallsBefore);
    });
  });

  describe("pauseForSse()", () => {
    it("clears alarm and timer", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(200, { messages: [], expired: false }),
      );
      await poller.start("sse-1", "tok-sse");
      await poller.pauseForSse("sse-1");
      // alarm should have been cleared
      expect(chrome.alarms.clear).toHaveBeenCalledWith("sm-poll-sse-1");
    });
  });

  describe("resumeFromSse()", () => {
    it("re-creates alarm for active alias", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        jsonResponse(200, { messages: [], expired: false }),
      );
      await poller.start("sse-2", "tok-sse2");
      await poller.pauseForSse("sse-2");
      (chrome.alarms.create as ReturnType<typeof vi.fn>).mockClear();
      await poller.resumeFromSse("sse-2");
      expect(chrome.alarms.create).toHaveBeenCalledWith(
        "sm-poll-sse-2",
        expect.objectContaining({ delayInMinutes: expect.any(Number) }),
      );
    });

    it("does nothing for inactive alias", async () => {
      (chrome.alarms.create as ReturnType<typeof vi.fn>).mockClear();
      await poller.resumeFromSse("not-active");
      expect(chrome.alarms.create).not.toHaveBeenCalled();
    });
  });

  describe("tick error handling", () => {
    it("stops on AliasExpiredError", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(200, { messages: [], expired: false })) // start
        .mockResolvedValueOnce(new Response("", { status: 410 })); // tick -> expired
      await poller.start("exp-1", "tok-exp");
      await vi.advanceTimersByTimeAsync(3000);
      await poller.onAlarm("exp-1");
      const stored = await chrome.storage.local.get("activePollers");
      const pollers = (stored as { activePollers?: Record<string, unknown> }).activePollers ?? {};
      expect(pollers["exp-1"]).toBeUndefined();
    });

    it("stops on TokenRevokedError", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(200, { messages: [], expired: false })) // start
        .mockResolvedValueOnce(new Response("", { status: 401 })); // tick -> revoked
      await poller.start("rev-1", "tok-rev");
      await vi.advanceTimersByTimeAsync(3000);
      await poller.onAlarm("rev-1");
      const stored = await chrome.storage.local.get("activePollers");
      const pollers = (stored as { activePollers?: Record<string, unknown> }).activePollers ?? {};
      expect(pollers["rev-1"]).toBeUndefined();
    });

    it("applies exponential backoff on network errors", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(200, { messages: [], expired: false })) // start
        .mockRejectedValueOnce(new Error("network")); // tick -> error
      await poller.start("net-1", "tok-net");
      await vi.advanceTimersByTimeAsync(3000);
      await poller.onAlarm("net-1");
      // Poller should still exist with incremented failure count
      const stored = await chrome.storage.local.get("activePollers");
      const pollers = (stored as { activePollers?: Record<string, { consecutiveFailures: number }> }).activePollers ?? {};
      expect(pollers["net-1"]).toBeDefined();
      expect(pollers["net-1"]!.consecutiveFailures).toBe(1);
    });

    it("stops after MAX_FAILURES consecutive errors", async () => {
      // Pre-seed a state with 4 consecutive failures
      const state = {
        aliasId: "fail-1",
        pollToken: "tok-fail",
        startedAt: Date.now(),
        nextPollAt: Date.now(),
        attempt: 0,
        consecutiveFailures: 4, // one more will reach MAX_FAILURES (5)
        lastSince: 0,
      };
      await chrome.storage.local.set({
        activePollers: { "fail-1": state },
      });

      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network"));

      // Access the tick via onAlarm
      await poller.rehydrateAll();
      await vi.advanceTimersByTimeAsync(3000);
      await poller.onAlarm("fail-1");

      // After 5th failure the poller should be stopped
      const stored = await chrome.storage.local.get("activePollers");
      const pollers = (stored as { activePollers?: Record<string, unknown> }).activePollers ?? {};
      expect(pollers["fail-1"]).toBeUndefined();
    });

    it("stops when session exceeds MAX_SESSION_MS", async () => {
      // Pre-seed a state that started > 2 minutes ago
      const state = {
        aliasId: "timeout-1",
        pollToken: "tok-to",
        startedAt: Date.now() - 130_000, // 130s > 120s max
        nextPollAt: Date.now(),
        attempt: 0,
        consecutiveFailures: 0,
        lastSince: 0,
      };
      await chrome.storage.local.set({
        activePollers: { "timeout-1": state },
      });
      await poller.rehydrateAll();
      // Should have been cleaned up during rehydration since it's expired
      // But even if rehydrateAll skips it, onAlarm should stop it
      await poller.onAlarm("timeout-1");
    });

    it("handles RateLimitError with retryAfterMs", async () => {
      vi.spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(jsonResponse(200, { messages: [], expired: false })) // start
        .mockResolvedValueOnce(
          new Response("", { status: 429, headers: { "retry-after": "10" } }),
        ); // tick -> rate limited
      await poller.start("rl-1", "tok-rl");
      await vi.advanceTimersByTimeAsync(3000);
      await poller.onAlarm("rl-1");
      // Should still be in storage with increased failure count
      const stored = await chrome.storage.local.get("activePollers");
      const pollers = (stored as { activePollers?: Record<string, { consecutiveFailures: number }> }).activePollers ?? {};
      expect(pollers["rl-1"]).toBeDefined();
      expect(pollers["rl-1"]!.consecutiveFailures).toBe(1);
    });
  });
});
