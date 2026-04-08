// Lazy migration: chrome.storage.local → IndexedDB (Managed Mode aliases).
// Triggered once on `chrome.runtime.onInstalled` with reason "update".
// Idempotent — safe to run multiple times; already-migrated records are
// silently skipped via IndexedDB's put() (upsert semantics).

import { putAlias, type IdbAliasRecord } from "../lib/indexeddb.js";
import { generateKey, exportKey } from "../lib/crypto.js";

const MANAGED_KEY_STORAGE = "managedKey";
const MANAGED_ALIASES_STORAGE = "managedAliases";

/**
 * Ensure a managed-mode encryption key exists in chrome.storage.local.
 * Creates and persists a new AES-256-GCM key if absent.
 */
async function ensureManagedKey(): Promise<void> {
  const existing = await chrome.storage.local.get(MANAGED_KEY_STORAGE);
  if (existing[MANAGED_KEY_STORAGE]) return;
  const key = await generateKey();
  const jwk = await exportKey(key);
  await chrome.storage.local.set({ [MANAGED_KEY_STORAGE]: jwk });
}

interface LegacyAliasRecord {
  aliasId?: string;
  address?: string;
  createdAt?: number;
  tags?: string[];
  label?: string;
}

/**
 * Migrate managed aliases from chrome.storage.local to IndexedDB.
 * Called once per `onInstalled` update event.
 */
export async function migrateToIndexedDb(): Promise<void> {
  await ensureManagedKey();

  const stored = await chrome.storage.local.get(MANAGED_ALIASES_STORAGE);
  const legacy = stored[MANAGED_ALIASES_STORAGE] as
    | Record<string, LegacyAliasRecord>
    | undefined;

  if (!legacy || typeof legacy !== "object") return;

  const records: IdbAliasRecord[] = [];
  for (const [aliasId, raw] of Object.entries(legacy)) {
    if (!raw?.address) continue;
    records.push({
      aliasId,
      address: raw.address,
      createdAt: raw.createdAt ?? Date.now(),
      tags: raw.tags,
      label: raw.label,
    });
  }

  // Migrate in a single async sequence to avoid overwhelming IDB.
  for (const rec of records) {
    try {
      await putAlias(rec);
    } catch {
      // Individual failure should not abort the rest.
    }
  }
}
