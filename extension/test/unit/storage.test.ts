/**
 * Unit tests for background/storage.ts — chrome.storage.local wrapper.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  getSettings,
  setSettings,
  initSettingsIfAbsent,
  getActiveAliases,
  putActiveAlias,
  removeActiveAliasByAliasId,
  getManagedAliases,
  putManagedAlias,
  removeManagedAlias,
  getActivePollers,
  putPollerState,
  removePollerState,
  type PollerState,
} from "../../src/background/storage";
import { DEFAULT_SETTINGS, type AliasRecord } from "../../src/lib/types";

beforeEach(() => {
  // Clear the storage mock store before each test.
  (chrome.storage.local as unknown as { _store: Map<string, unknown> })._store.clear();
});

function makeAlias(overrides: Partial<AliasRecord> = {}): AliasRecord {
  return {
    aliasId: "alias-1",
    address: "alias1@shldmail.work",
    expiresAt: null,
    pollToken: "tok-1",
    mode: "ephemeral",
    createdAt: Date.now(),
    origin: "https://example.com",
    ...overrides,
  };
}

describe("Settings", () => {
  it("getSettings returns defaults when nothing stored", async () => {
    const s = await getSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it("setSettings merges patch with current settings", async () => {
    const updated = await setSettings({ autoCopyOtp: false });
    expect(updated.autoCopyOtp).toBe(false);
    expect(updated.userMode).toBe(DEFAULT_SETTINGS.userMode);
  });

  it("initSettingsIfAbsent creates defaults when empty", async () => {
    await initSettingsIfAbsent();
    const s = await getSettings();
    expect(s).toEqual(DEFAULT_SETTINGS);
  });

  it("initSettingsIfAbsent does NOT overwrite existing settings", async () => {
    await setSettings({ autoCopyOtp: false });
    await initSettingsIfAbsent();
    const s = await getSettings();
    expect(s.autoCopyOtp).toBe(false);
  });
});

describe("Active Aliases", () => {
  it("returns empty object when nothing stored", async () => {
    const aliases = await getActiveAliases();
    expect(aliases).toEqual({});
  });

  it("putActiveAlias stores by origin", async () => {
    const alias = makeAlias({ origin: "https://github.com" });
    await putActiveAlias(alias);
    const aliases = await getActiveAliases();
    expect(aliases["https://github.com"]).toEqual(alias);
  });

  it("removeActiveAliasByAliasId removes matching alias", async () => {
    const alias = makeAlias({ aliasId: "remove-me", origin: "https://a.com" });
    await putActiveAlias(alias);
    await removeActiveAliasByAliasId("remove-me");
    const aliases = await getActiveAliases();
    expect(aliases["https://a.com"]).toBeUndefined();
  });

  it("removeActiveAliasByAliasId is no-op for unknown id", async () => {
    const alias = makeAlias({ aliasId: "keep-me", origin: "https://b.com" });
    await putActiveAlias(alias);
    await removeActiveAliasByAliasId("unknown");
    const aliases = await getActiveAliases();
    expect(aliases["https://b.com"]).toBeDefined();
  });
});

describe("Managed Aliases", () => {
  it("returns empty object when nothing stored", async () => {
    const aliases = await getManagedAliases();
    expect(aliases).toEqual({});
  });

  it("putManagedAlias stores by aliasId", async () => {
    const alias = makeAlias({ aliasId: "managed-1", mode: "managed" });
    await putManagedAlias(alias);
    const aliases = await getManagedAliases();
    expect(aliases["managed-1"]).toEqual(alias);
  });

  it("removeManagedAlias removes by aliasId", async () => {
    const alias = makeAlias({ aliasId: "del-1", mode: "managed" });
    await putManagedAlias(alias);
    await removeManagedAlias("del-1");
    const aliases = await getManagedAliases();
    expect(aliases["del-1"]).toBeUndefined();
  });
});

describe("Active Pollers", () => {
  it("returns empty object when nothing stored", async () => {
    const pollers = await getActivePollers();
    expect(pollers).toEqual({});
  });

  it("putPollerState and getActivePollers round-trip", async () => {
    const state: PollerState = {
      aliasId: "poll-1",
      pollToken: "tok",
      startedAt: Date.now(),
      nextPollAt: Date.now() + 2000,
      attempt: 0,
      consecutiveFailures: 0,
      lastSince: 0,
    };
    await putPollerState(state);
    const pollers = await getActivePollers();
    expect(pollers["poll-1"]).toEqual(state);
  });

  it("removePollerState removes by aliasId", async () => {
    const state: PollerState = {
      aliasId: "poll-del",
      pollToken: "tok",
      startedAt: Date.now(),
      nextPollAt: Date.now() + 2000,
      attempt: 0,
      consecutiveFailures: 0,
      lastSince: 0,
    };
    await putPollerState(state);
    await removePollerState("poll-del");
    const pollers = await getActivePollers();
    expect(pollers["poll-del"]).toBeUndefined();
  });
});
