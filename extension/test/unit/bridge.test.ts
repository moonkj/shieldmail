/**
 * Unit tests for content/bridge.ts — sendMessage with timeout, error handling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMessage } from "../../src/content/bridge";

beforeEach(() => {
  vi.clearAllMocks();
  // Override chrome.runtime.sendMessage to use callback pattern
  // (as the bridge implementation uses the callback-based API)
  (chrome.runtime as unknown as Record<string, unknown>).sendMessage = vi.fn(
    (_msg: unknown, callback?: (response: unknown) => void) => {
      // Default: callback with ok response
      if (callback) callback({ ok: true });
    },
  );
  chrome.runtime.lastError = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("sendMessage()", () => {
  it("resolves with response on success", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg: unknown, callback: (r: unknown) => void) => {
        callback({ ok: true, data: "test" });
      },
    );

    const result = await sendMessage({ type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://test.com" });
    expect(result).toEqual({ ok: true, data: "test" });
  });

  it("returns error when chrome.runtime.lastError is set", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg: unknown, callback: (r: unknown) => void) => {
        chrome.runtime.lastError = { message: "Extension context invalidated" };
        callback(undefined);
        chrome.runtime.lastError = undefined;
      },
    );

    const result = await sendMessage({ type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://test.com" });
    expect(result).toEqual({
      ok: false,
      error: "Extension context invalidated",
    });
  });

  it("returns error when response is null", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      (_msg: unknown, callback: (r: unknown) => void) => {
        callback(null);
      },
    );

    const result = await sendMessage({ type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://test.com" });
    expect(result).toEqual({ ok: false, error: "empty_response" });
  });

  it("returns error on timeout", async () => {
    vi.useFakeTimers();

    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        // Never calls the callback — simulates a hung response
      },
    );

    const promise = sendMessage(
      { type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://test.com" },
      100, // short timeout
    );
    vi.advanceTimersByTime(200);
    const result = await promise;
    expect(result).toEqual({ ok: false, error: "timeout" });
  });

  it("returns error when sendMessage throws", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error("context destroyed");
      },
    );

    const result = await sendMessage({ type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://test.com" });
    expect(result).toEqual({ ok: false, error: "context destroyed" });
  });

  it("returns send_failed for non-Error throws", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw "string error"; // eslint-disable-line no-throw-literal
      },
    );

    const result = await sendMessage({ type: "GENERATE_ALIAS", mode: "ephemeral", origin: "https://test.com" });
    expect(result).toEqual({ ok: false, error: "send_failed" });
  });
});
