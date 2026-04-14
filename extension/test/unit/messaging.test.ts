/**
 * Unit tests for lib/messaging.ts — isRuntimeMessage, sendRuntime, sendToTab, ErrorCode.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isRuntimeMessage,
  sendRuntime,
  sendToTab,
  type ExtRuntimeMessage,
} from "../../src/lib/messaging";

describe("isRuntimeMessage()", () => {
  it("returns true for a valid runtime message with type string", () => {
    expect(isRuntimeMessage({ type: "GENERATE_ALIAS" })).toBe(true);
  });

  it("returns true for ForceInjectMessage", () => {
    expect(isRuntimeMessage({ type: "FORCE_INJECT" })).toBe(true);
  });

  it("returns true for PingMessage", () => {
    expect(isRuntimeMessage({ type: "__SHIELDMAIL_PING__" })).toBe(true);
  });

  it("returns true for SseActiveMessage", () => {
    expect(isRuntimeMessage({ type: "SSE_ACTIVE", aliasId: "a1" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRuntimeMessage(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRuntimeMessage(undefined)).toBe(false);
  });

  it("returns false for string", () => {
    expect(isRuntimeMessage("hello")).toBe(false);
  });

  it("returns false for number", () => {
    expect(isRuntimeMessage(42)).toBe(false);
  });

  it("returns false for object without type", () => {
    expect(isRuntimeMessage({ action: "test" })).toBe(false);
  });

  it("returns false for object with non-string type", () => {
    expect(isRuntimeMessage({ type: 42 })).toBe(false);
  });
});

describe("sendRuntime()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends message via chrome.runtime.sendMessage and returns response", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      data: "test",
    });

    const msg: ExtRuntimeMessage = { type: "FORCE_INJECT" };
    const result = await sendRuntime(msg);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(msg);
    expect(result).toEqual({ ok: true, data: "test" });
  });

  it("returns undefined when chrome.runtime.sendMessage throws", async () => {
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("no receiver"),
    );

    const result = await sendRuntime({ type: "__SHIELDMAIL_PING__" });
    expect(result).toBeUndefined();
  });
});

describe("sendToTab()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends message via chrome.tabs.sendMessage", async () => {
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
    });

    const msg: ExtRuntimeMessage = { type: "FORCE_INJECT" };
    const result = await sendToTab(123, msg);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, msg);
    expect(result).toEqual({ ok: true });
  });

  it("returns undefined when chrome.tabs.sendMessage throws", async () => {
    (chrome.tabs.sendMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("tab closed"),
    );

    const result = await sendToTab(999, { type: "FORCE_INJECT" });
    expect(result).toBeUndefined();
  });
});
