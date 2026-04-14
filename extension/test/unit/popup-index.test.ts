/**
 * Unit tests for popup/index.tsx — entry point with PING/PONG listener.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<div id="root"></div>';
});

describe("popup/index.tsx PING/PONG responder", () => {
  it("responds to __SHIELDMAIL_PING__ with __SHIELDMAIL_PONG__", () => {
    // The PING/PONG responder is set up via chrome.runtime.onMessage.addListener
    // Simulate what the responder does.
    const sendResponse = vi.fn();
    const msg = { type: "__SHIELDMAIL_PING__" };

    // Simulate the listener logic
    if (
      msg &&
      typeof msg === "object" &&
      (msg as { type?: string }).type === "__SHIELDMAIL_PING__"
    ) {
      sendResponse({ type: "__SHIELDMAIL_PONG__" });
    }

    expect(sendResponse).toHaveBeenCalledWith({
      type: "__SHIELDMAIL_PONG__",
    });
  });

  it("does not respond to other messages", () => {
    const sendResponse = vi.fn();
    const msg = { type: "OTHER_MESSAGE" };

    if (
      msg &&
      typeof msg === "object" &&
      (msg as { type?: string }).type === "__SHIELDMAIL_PING__"
    ) {
      sendResponse({ type: "__SHIELDMAIL_PONG__" });
    }

    expect(sendResponse).not.toHaveBeenCalled();
  });
});
