/**
 * Extended unit tests for popup/state/store.ts — useSettings, useActiveAliases,
 * useManagedAliases hooks via Preact rendering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { h } from "preact";
import { renderComponent, flush } from "../component/_render";
import {
  useSettings,
  useActiveAliases,
  useManagedAliases,
  writeSettings,
  getActiveTabOrigin,
  getActiveTabId,
  onRuntimeMessage,
} from "../../src/popup/state/store";
import { DEFAULT_SETTINGS, type AliasRecord } from "../../src/lib/types";

beforeEach(() => {
  vi.clearAllMocks();
  (chrome.storage.local as unknown as { _store: Map<string, unknown> })._store.clear();
});

// Helper component for testing useSettings hook
function SettingsConsumer(props: { onRender?: (settings: unknown, update: unknown) => void }) {
  const [settings, update] = useSettings();
  if (props.onRender) props.onRender(settings, update);
  return h("div", { "data-testid": "settings" }, JSON.stringify(settings));
}

// Helper component for testing useActiveAliases hook
function AliasConsumer(props: { onRender?: (aliases: AliasRecord[]) => void }) {
  const aliases = useActiveAliases();
  if (props.onRender) props.onRender(aliases);
  return h("div", { "data-testid": "aliases" }, aliases.length.toString());
}

// Helper component for testing useManagedAliases hook
function ManagedConsumer(props: { onRender?: (aliases: AliasRecord[]) => void }) {
  const aliases = useManagedAliases();
  if (props.onRender) props.onRender(aliases);
  return h("div", { "data-testid": "managed" }, aliases.length.toString());
}

describe("useSettings() hook", () => {
  it("returns default settings initially", () => {
    const { container } = renderComponent(SettingsConsumer, {});
    const text = container.textContent ?? "";
    expect(text).toContain(DEFAULT_SETTINGS.apiBaseUrl);
  });

  it("loads settings from storage on mount", async () => {
    const custom = { ...DEFAULT_SETTINGS, userMode: "everyday" };
    await chrome.storage.local.set({ settings: custom });
    const { container } = renderComponent(SettingsConsumer, {});
    await flush();
    await flush();
    const text = container.textContent ?? "";
    expect(text).toContain("everyday");
  });

  it("reacts to storage changes", async () => {
    const { container } = renderComponent(SettingsConsumer, {});
    // Wait for useEffect to register the listener
    await flush();
    await flush();
    await new Promise((r) => setTimeout(r, 50));
    // Emit a storage change event
    const emit = (chrome.storage.onChanged as unknown as { _emit: (...args: unknown[]) => void })._emit;
    emit(
      { settings: { newValue: { ...DEFAULT_SETTINGS, userMode: "everyday" } } },
      "local",
    );
    await flush();
    await flush();
    await new Promise((r) => setTimeout(r, 50));
    const text = container.textContent ?? "";
    expect(text).toContain("everyday");
  });

  it("ignores non-local storage changes", async () => {
    const { container } = renderComponent(SettingsConsumer, {});
    await flush();
    const emit = (chrome.storage.onChanged as unknown as { _emit: (...args: unknown[]) => void })._emit;
    emit(
      { settings: { newValue: { ...DEFAULT_SETTINGS, userMode: "everyday" } } },
      "sync", // not "local"
    );
    await flush();
    const text = container.textContent ?? "";
    expect(text).toContain("developer"); // Still default
  });

  it("ignores changes without settings key", async () => {
    const { container } = renderComponent(SettingsConsumer, {});
    await flush();
    const emit = (chrome.storage.onChanged as unknown as { _emit: (...args: unknown[]) => void })._emit;
    emit({ activeAliases: { newValue: {} } }, "local");
    await flush();
    // Should not change settings
    const text = container.textContent ?? "";
    expect(text).toContain("developer");
  });

  it("update function writes settings and updates state", async () => {
    let capturedUpdate: ((patch: Partial<typeof DEFAULT_SETTINGS>) => Promise<void>) | null = null;
    renderComponent(SettingsConsumer, {
      onRender: (_s: unknown, u: unknown) => { capturedUpdate = u as typeof capturedUpdate; },
    });
    await flush();
    expect(capturedUpdate).not.toBeNull();
    await capturedUpdate!({ autoCopyOtp: false });
    // Verify storage was updated
    const stored = await chrome.storage.local.get("settings");
    expect((stored as { settings: typeof DEFAULT_SETTINGS }).settings.autoCopyOtp).toBe(false);
  });
});

describe("useActiveAliases() hook", () => {
  it("returns empty array initially", () => {
    const { container } = renderComponent(AliasConsumer, {});
    expect(container.textContent).toContain("0");
  });

  it("loads aliases from storage on mount", async () => {
    const alias: AliasRecord = {
      aliasId: "a1",
      address: "a1@shldmail.work",
      expiresAt: null,
      pollToken: "tok",
      mode: "ephemeral",
      createdAt: Date.now(),
    };
    await chrome.storage.local.set({ activeAliases: { a1: alias } });
    const { container } = renderComponent(AliasConsumer, {});
    await flush();
    await flush();
    expect(container.textContent).toContain("1");
  });

  it("reacts to activeAliases storage changes", async () => {
    const { container } = renderComponent(AliasConsumer, {});
    await flush();
    await flush();
    await new Promise((r) => setTimeout(r, 50));
    const alias: AliasRecord = {
      aliasId: "a2",
      address: "a2@shldmail.work",
      expiresAt: null,
      pollToken: "tok2",
      mode: "managed",
      createdAt: Date.now(),
    };
    const emit = (chrome.storage.onChanged as unknown as { _emit: (...args: unknown[]) => void })._emit;
    emit({ activeAliases: { newValue: { a2: alias } } }, "local");
    await flush();
    await flush();
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toContain("1");
  });

  it("ignores non-local area changes", async () => {
    const { container } = renderComponent(AliasConsumer, {});
    await flush();
    const emit = (chrome.storage.onChanged as unknown as { _emit: (...args: unknown[]) => void })._emit;
    emit({ activeAliases: { newValue: { a1: {} } } }, "sync");
    await flush();
    expect(container.textContent).toContain("0");
  });

  it("ignores changes without activeAliases key", async () => {
    const { container } = renderComponent(AliasConsumer, {});
    await flush();
    const emit = (chrome.storage.onChanged as unknown as { _emit: (...args: unknown[]) => void })._emit;
    emit({ settings: { newValue: {} } }, "local");
    await flush();
    expect(container.textContent).toContain("0");
  });
});

describe("useManagedAliases() hook", () => {
  it("returns empty array initially", () => {
    const { container } = renderComponent(ManagedConsumer, {});
    expect(container.textContent).toContain("0");
  });

  it("loads managed aliases from storage on mount", async () => {
    const alias: AliasRecord = {
      aliasId: "m1",
      address: "m1@shldmail.work",
      expiresAt: null,
      pollToken: "tok",
      mode: "managed",
      createdAt: Date.now(),
    };
    await chrome.storage.local.set({ managedAliases: { m1: alias } });
    const { container } = renderComponent(ManagedConsumer, {});
    await flush();
    await flush();
    expect(container.textContent).toContain("1");
  });

  it("reacts to managedAliases storage changes", async () => {
    const { container } = renderComponent(ManagedConsumer, {});
    await flush();
    await flush();
    await new Promise((r) => setTimeout(r, 50));
    const alias: AliasRecord = {
      aliasId: "m2",
      address: "m2@shldmail.work",
      expiresAt: null,
      pollToken: "tok2",
      mode: "managed",
      createdAt: Date.now(),
    };
    const emit = (chrome.storage.onChanged as unknown as { _emit: (...args: unknown[]) => void })._emit;
    emit({ managedAliases: { newValue: { m2: alias } } }, "local");
    await flush();
    await flush();
    await new Promise((r) => setTimeout(r, 50));
    expect(container.textContent).toContain("1");
  });

  it("ignores non-local area changes", async () => {
    const { container } = renderComponent(ManagedConsumer, {});
    await flush();
    const emit = (chrome.storage.onChanged as unknown as { _emit: (...args: unknown[]) => void })._emit;
    emit({ managedAliases: { newValue: { m1: {} } } }, "sync");
    await flush();
    expect(container.textContent).toContain("0");
  });

  it("ignores changes without managedAliases key", async () => {
    const { container } = renderComponent(ManagedConsumer, {});
    await flush();
    const emit = (chrome.storage.onChanged as unknown as { _emit: (...args: unknown[]) => void })._emit;
    emit({ activeAliases: { newValue: {} } }, "local");
    await flush();
    expect(container.textContent).toContain("0");
  });
});
