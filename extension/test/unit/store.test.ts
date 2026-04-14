/**
 * Unit tests for popup/state/store.ts — storage hooks and helpers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  writeSettings,
  getActiveTabOrigin,
  getActiveTabId,
  onRuntimeMessage,
} from "../../src/popup/state/store";
import { DEFAULT_SETTINGS } from "../../src/lib/types";

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.storage.local as unknown as { _store: Map<string, unknown> })._store.clear();
});

describe("writeSettings()", () => {
  it("merges patch with existing settings in storage", async () => {
    await writeSettings({ autoCopyOtp: false });
    const stored = await chrome.storage.local.get("settings");
    const settings = (stored as { settings: typeof DEFAULT_SETTINGS }).settings;
    expect(settings.autoCopyOtp).toBe(false);
    // Other defaults should be preserved.
    expect(settings.userMode).toBe(DEFAULT_SETTINGS.userMode);
  });

  it("creates settings from defaults when none exist", async () => {
    await writeSettings({ userMode: "everyday" });
    const stored = await chrome.storage.local.get("settings");
    const settings = (stored as { settings: typeof DEFAULT_SETTINGS }).settings;
    expect(settings.userMode).toBe("everyday");
    expect(settings.apiBaseUrl).toBe(DEFAULT_SETTINGS.apiBaseUrl);
  });
});

describe("getActiveTabOrigin()", () => {
  it("returns origin of the active tab", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { url: "https://github.com/signup" },
    ]);
    const origin = await getActiveTabOrigin();
    expect(origin).toBe("https://github.com");
  });

  it("returns null when no tabs", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const origin = await getActiveTabOrigin();
    expect(origin).toBeNull();
  });

  it("returns null when tab has no url", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{}]);
    const origin = await getActiveTabOrigin();
    expect(origin).toBeNull();
  });

  it("returns null for invalid URL", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { url: "not-a-url" },
    ]);
    const origin = await getActiveTabOrigin();
    expect(origin).toBeNull();
  });
});

describe("getActiveTabId()", () => {
  it("returns tab id of active tab", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 42 },
    ]);
    const id = await getActiveTabId();
    expect(id).toBe(42);
  });

  it("returns null when no tabs", async () => {
    (chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    const id = await getActiveTabId();
    expect(id).toBeNull();
  });
});

describe("onRuntimeMessage()", () => {
  it("adds a listener and returns cleanup fn", () => {
    const handler = vi.fn();
    const cleanup = onRuntimeMessage(handler);
    expect(typeof cleanup).toBe("function");

    // Simulate a message
    (
      chrome.runtime.onMessage as unknown as {
        _emit: (...args: unknown[]) => void;
      }
    )._emit({ type: "TEST" });
    expect(handler).toHaveBeenCalledWith({ type: "TEST" });

    // Cleanup
    cleanup();
  });

  it("cleanup removes the listener", () => {
    const handler = vi.fn();
    const cleanup = onRuntimeMessage(handler);
    cleanup();

    // Message after cleanup should not trigger handler
    (
      chrome.runtime.onMessage as unknown as {
        _emit: (...args: unknown[]) => void;
      }
    )._emit({ type: "AFTER_CLEANUP" });
    expect(handler).not.toHaveBeenCalledWith({ type: "AFTER_CLEANUP" });
  });
});
