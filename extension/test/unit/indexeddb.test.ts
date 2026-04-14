/**
 * Unit tests for lib/indexeddb.ts — IndexedDB wrapper via fake-indexeddb.
 *
 * happy-dom does NOT provide an indexedDB implementation, so we use
 * fake-indexeddb to polyfill it in the test environment.
 *
 * Each test gets a fresh IDBFactory + fresh module instance so the internal
 * _db cache is reset between tests.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import type { IdbAliasRecord, IdbMessageRecord } from "../../src/lib/indexeddb";

// Provide a fresh indexedDB + fresh module before each test.
beforeEach(async () => {
  const { IDBFactory } = await import("fake-indexeddb");
  (globalThis as unknown as Record<string, unknown>).indexedDB = new IDBFactory();
  vi.resetModules();
});

/** Dynamically import indexeddb module to get a fresh instance (with reset _db cache). */
async function idb() {
  return import("../../src/lib/indexeddb");
}

describe("aliasStore", () => {
  it("putAlias and getAlias round-trip", async () => {
    const { putAlias, getAlias } = await idb();
    const record: IdbAliasRecord = {
      aliasId: "test-alias-1",
      address: "test@shldmail.work",
      createdAt: Date.now(),
      tags: ["QA"],
      label: "GitHub",
    };
    await putAlias(record);
    const result = await getAlias("test-alias-1");
    expect(result).toEqual(record);
  });

  it("getAlias returns undefined for non-existent key", async () => {
    const { getAlias } = await idb();
    const result = await getAlias("non-existent");
    expect(result).toBeUndefined();
  });

  it("getAllAliases returns all stored aliases", async () => {
    const { putAlias, getAllAliases } = await idb();
    await putAlias({ aliasId: "a1", address: "a1@x.com", createdAt: 1 });
    await putAlias({ aliasId: "a2", address: "a2@x.com", createdAt: 2 });
    const all = await getAllAliases();
    expect(all).toHaveLength(2);
    const ids = all.map((a) => a.aliasId).sort();
    expect(ids).toEqual(["a1", "a2"]);
  });

  it("putAlias upserts (overwrites) existing record", async () => {
    const { putAlias, getAlias } = await idb();
    await putAlias({ aliasId: "up1", address: "old@x.com", createdAt: 1 });
    await putAlias({ aliasId: "up1", address: "new@x.com", createdAt: 2 });
    const result = await getAlias("up1");
    expect(result?.address).toBe("new@x.com");
    expect(result?.createdAt).toBe(2);
  });

  it("deleteAlias removes the record", async () => {
    const { putAlias, deleteAlias, getAlias } = await idb();
    await putAlias({ aliasId: "del1", address: "del@x.com", createdAt: 1 });
    await deleteAlias("del1");
    const result = await getAlias("del1");
    expect(result).toBeUndefined();
  });

  it("deleteAlias is a no-op for non-existent key", async () => {
    const { deleteAlias } = await idb();
    // Should not throw.
    await expect(deleteAlias("nonexistent")).resolves.toBeUndefined();
  });
});

describe("messageStore", () => {
  it("putMessage and getMessagesByAlias round-trip", async () => {
    const { putMessage, getMessagesByAlias } = await idb();
    const msg: IdbMessageRecord = {
      id: "msg-1",
      aliasId: "alias-A",
      receivedAt: Date.now(),
      encryptedPayload: new Uint8Array([1, 2, 3, 4]),
    };
    await putMessage(msg);
    const results = await getMessagesByAlias("alias-A");
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("msg-1");
  });

  it("getMessagesByAlias returns only messages for that alias", async () => {
    const { putMessage, getMessagesByAlias } = await idb();
    await putMessage({ id: "m1", aliasId: "a1", receivedAt: 1, encryptedPayload: new Uint8Array([1]) });
    await putMessage({ id: "m2", aliasId: "a2", receivedAt: 2, encryptedPayload: new Uint8Array([2]) });
    await putMessage({ id: "m3", aliasId: "a1", receivedAt: 3, encryptedPayload: new Uint8Array([3]) });

    const a1msgs = await getMessagesByAlias("a1");
    expect(a1msgs).toHaveLength(2);
    expect(a1msgs.map((m) => m.id).sort()).toEqual(["m1", "m3"]);

    const a2msgs = await getMessagesByAlias("a2");
    expect(a2msgs).toHaveLength(1);
  });

  it("deleteMessage removes a single message", async () => {
    const { putMessage, deleteMessage, getMessagesByAlias } = await idb();
    await putMessage({ id: "dm1", aliasId: "a1", receivedAt: 1, encryptedPayload: new Uint8Array([1]) });
    await putMessage({ id: "dm2", aliasId: "a1", receivedAt: 2, encryptedPayload: new Uint8Array([2]) });
    await deleteMessage("dm1");
    const results = await getMessagesByAlias("a1");
    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("dm2");
  });

  it("deleteMessagesByAlias removes all messages for that alias", async () => {
    const { putMessage, deleteMessagesByAlias, getMessagesByAlias } = await idb();
    await putMessage({ id: "x1", aliasId: "bulk", receivedAt: 1, encryptedPayload: new Uint8Array([1]) });
    await putMessage({ id: "x2", aliasId: "bulk", receivedAt: 2, encryptedPayload: new Uint8Array([2]) });
    await putMessage({ id: "x3", aliasId: "other", receivedAt: 3, encryptedPayload: new Uint8Array([3]) });
    await deleteMessagesByAlias("bulk");
    const bulkMsgs = await getMessagesByAlias("bulk");
    expect(bulkMsgs).toHaveLength(0);
    const otherMsgs = await getMessagesByAlias("other");
    expect(otherMsgs).toHaveLength(1);
  });

  it("getMessagesByAlias returns empty array when no messages exist", async () => {
    const { getMessagesByAlias } = await idb();
    const results = await getMessagesByAlias("no-messages");
    expect(results).toEqual([]);
  });
});

describe("openDb()", () => {
  it("returns a valid IDBDatabase", async () => {
    const { openDb } = await idb();
    const db = await openDb();
    expect(db).toBeDefined();
    expect(db.name).toBe("shieldmail_v1");
  });

  it("returns the same cached instance on second call", async () => {
    const { openDb } = await idb();
    const db1 = await openDb();
    const db2 = await openDb();
    expect(db1).toBe(db2);
  });
});
