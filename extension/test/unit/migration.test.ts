/**
 * Unit tests for background/migration.ts — migrateToIndexedDb.
 *
 * Tests that touch IndexedDB use fake-indexeddb with vi.resetModules()
 * to ensure a fresh database + module state per test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";

beforeEach(async () => {
  vi.clearAllMocks();
  (chrome.storage.local as unknown as { _store: Map<string, unknown> })._store.clear();

  // Provide a fresh indexedDB factory so the cached _db from the previous test
  // does not leak. vi.resetModules() ensures dynamic imports get fresh modules.
  const { IDBFactory } = await import("fake-indexeddb");
  (globalThis as unknown as Record<string, unknown>).indexedDB = new IDBFactory();
  vi.resetModules();
});

/** Dynamically import migration module (fresh after resetModules). */
async function loadMigration() {
  return import("../../src/background/migration");
}

/** Dynamically import indexeddb module (fresh after resetModules). */
async function loadIdb() {
  return import("../../src/lib/indexeddb");
}

describe("migrateToIndexedDb()", () => {
  it("creates managed key if absent", async () => {
    const { migrateToIndexedDb } = await loadMigration();
    // Set up: no managedKey, no managedAliases
    await migrateToIndexedDb();
    // After migration, managedKey should be set
    const stored = await chrome.storage.local.get("managedKey");
    expect(stored.managedKey).toBeDefined();
  });

  it("does not overwrite existing managed key", async () => {
    const { migrateToIndexedDb } = await loadMigration();
    // Set a pre-existing key
    const fakeJwk = { kty: "oct", k: "fake-key", alg: "A256GCM" };
    await chrome.storage.local.set({ managedKey: fakeJwk });

    await migrateToIndexedDb();

    const stored = await chrome.storage.local.get("managedKey");
    expect(stored.managedKey).toEqual(fakeJwk);
  });

  it("migrates legacy managed aliases to IndexedDB", async () => {
    const { migrateToIndexedDb } = await loadMigration();
    const legacyAliases = {
      "alias-1": {
        aliasId: "alias-1",
        address: "a1@shldmail.work",
        createdAt: 12345,
        tags: ["\uC5C5\uBB34"],
        label: "GitHub",
      },
      "alias-2": {
        aliasId: "alias-2",
        address: "a2@shldmail.work",
        createdAt: 67890,
      },
    };
    await chrome.storage.local.set({ managedAliases: legacyAliases });

    await migrateToIndexedDb();
    // Migration should complete without error.
    // We can verify by checking IndexedDB.
    const { getAlias } = await loadIdb();
    const a1 = await getAlias("alias-1");
    expect(a1?.address).toBe("a1@shldmail.work");
    expect(a1?.tags).toEqual(["\uC5C5\uBB34"]);
  });

  it("skips entries without an address", async () => {
    const { migrateToIndexedDb } = await loadMigration();
    const legacyAliases = {
      "bad-1": { aliasId: "bad-1" }, // no address
      "good-1": { aliasId: "good-1", address: "g1@x.com" },
    };
    await chrome.storage.local.set({ managedAliases: legacyAliases });

    await migrateToIndexedDb();

    const { getAlias } = await loadIdb();
    const bad = await getAlias("bad-1");
    expect(bad).toBeUndefined();
    const good = await getAlias("good-1");
    expect(good?.address).toBe("g1@x.com");
  });

  it("handles empty legacy aliases gracefully", async () => {
    const { migrateToIndexedDb } = await loadMigration();
    await chrome.storage.local.set({ managedAliases: {} });
    await expect(migrateToIndexedDb()).resolves.toBeUndefined();
  });

  it("handles missing legacy aliases key gracefully", async () => {
    const { migrateToIndexedDb } = await loadMigration();
    await expect(migrateToIndexedDb()).resolves.toBeUndefined();
  });
});
