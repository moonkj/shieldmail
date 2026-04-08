// IndexedDB schema for ShieldMail Managed Mode.
// DB name: "shieldmail_v1"
//
// Object stores:
//   aliasStore  — keyPath: "aliasId"
//     { aliasId, address, createdAt, tags?, label?, encryptedMeta? }
//   messageStore — keyPath: "id"
//     { id, aliasId, receivedAt, encryptedPayload: Uint8Array }
//     index: "aliasId" (for per-alias queries)
//
// Encryption: message payloads are encrypted with AES-256-GCM via crypto.ts.
// The encryption key JWK is stored in chrome.storage.local under "managedKey".

const DB_NAME = "shieldmail_v1";
const DB_VERSION = 1;

export interface IdbAliasRecord {
  aliasId: string;
  address: string;
  createdAt: number;
  tags?: string[];
  label?: string;
}

export interface IdbMessageRecord {
  id: string;
  aliasId: string;
  receivedAt: number;
  /** AES-GCM encrypted JSON payload (IV prepended). */
  encryptedPayload: Uint8Array;
}

let _db: IDBDatabase | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains("aliasStore")) {
        db.createObjectStore("aliasStore", { keyPath: "aliasId" });
      }

      if (!db.objectStoreNames.contains("messageStore")) {
        const msgStore = db.createObjectStore("messageStore", { keyPath: "id" });
        msgStore.createIndex("aliasId", "aliasId", { unique: false });
      }
    };

    req.onsuccess = (e) => {
      _db = (e.target as IDBOpenDBRequest).result;
      resolve(_db);
    };

    req.onerror = () => reject(req.error);
  });
}

function promisifyRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── aliasStore ─────────────────────────────────────────────────────────

export async function putAlias(record: IdbAliasRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("aliasStore", "readwrite");
  await promisifyRequest(tx.objectStore("aliasStore").put(record));
}

export async function getAlias(aliasId: string): Promise<IdbAliasRecord | undefined> {
  const db = await openDb();
  const tx = db.transaction("aliasStore", "readonly");
  const result = await promisifyRequest<IdbAliasRecord | undefined>(
    tx.objectStore("aliasStore").get(aliasId),
  );
  return result;
}

export async function getAllAliases(): Promise<IdbAliasRecord[]> {
  const db = await openDb();
  const tx = db.transaction("aliasStore", "readonly");
  return promisifyRequest<IdbAliasRecord[]>(tx.objectStore("aliasStore").getAll());
}

export async function deleteAlias(aliasId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("aliasStore", "readwrite");
  await promisifyRequest(tx.objectStore("aliasStore").delete(aliasId));
}

// ── messageStore ───────────────────────────────────────────────────────

export async function putMessage(record: IdbMessageRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("messageStore", "readwrite");
  await promisifyRequest(tx.objectStore("messageStore").put(record));
}

export async function getMessagesByAlias(aliasId: string): Promise<IdbMessageRecord[]> {
  const db = await openDb();
  const tx = db.transaction("messageStore", "readonly");
  const index = tx.objectStore("messageStore").index("aliasId");
  return promisifyRequest<IdbMessageRecord[]>(index.getAll(aliasId));
}

export async function deleteMessage(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("messageStore", "readwrite");
  await promisifyRequest(tx.objectStore("messageStore").delete(id));
}

export async function deleteMessagesByAlias(aliasId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("messageStore", "readwrite");
  const index = tx.objectStore("messageStore").index("aliasId");
  const keys = await promisifyRequest<IDBValidKey[]>(index.getAllKeys(aliasId));
  const store = tx.objectStore("messageStore");
  await Promise.all(keys.map((k) => promisifyRequest(store.delete(k))));
}
