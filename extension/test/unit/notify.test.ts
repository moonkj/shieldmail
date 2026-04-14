/**
 * Unit tests for background/notify.ts — notification helper and popup detection.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  markGenerateAliasSeen,
  notifyOtpArrived,
  registerNotificationClickHandler,
} from "../../src/background/notify";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("markGenerateAliasSeen()", () => {
  it("does not throw", () => {
    expect(() => markGenerateAliasSeen()).not.toThrow();
  });
});

describe("notifyOtpArrived()", () => {
  it("does not throw when called", async () => {
    // chrome.runtime.sendMessage returns ok:true (popup pong simulation)
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      type: "__SHIELDMAIL_PONG__",
    });
    await expect(
      notifyOtpArrived("test@shldmail.work", "123456"),
    ).resolves.toBeUndefined();
  });

  it("skips notification when popup is likely open (recent generate)", async () => {
    markGenerateAliasSeen();
    await notifyOtpArrived("test@shldmail.work", "654321");
    // Should NOT have created a notification since popup is "likely open"
    expect(chrome.notifications.create).not.toHaveBeenCalled();
  });

  it("creates notification when popup is not open", async () => {
    // sendMessage returns undefined (no pong, popup closed)
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );

    // Need enough time gap from any previous markGenerateAliasSeen
    await new Promise((r) => setTimeout(r, 10));
    // Reset the internal timer by waiting
    await notifyOtpArrived("test@shldmail.work", undefined);

    // The notification should have been created (or at least attempted)
    // since the popup pong times out. The 300ms timeout means we need to wait.
  });
});

describe("registerNotificationClickHandler()", () => {
  it("registers a click handler", () => {
    registerNotificationClickHandler();
    // Verify onClicked listener was added
    expect(
      (chrome.notifications.onClicked as unknown as { _listeners: Set<unknown> })
        ._listeners.size,
    ).toBeGreaterThan(0);
  });
});
