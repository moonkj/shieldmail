// Typed wrapper over chrome.storage.local.
// Namespaced keys only — never call chrome.storage.local directly elsewhere.

import {
  DEFAULT_SETTINGS,
  type AliasRecord,
  type UserSettings,
} from "../lib/types.js";

const K = {
  settings: "settings",
  activeAliases: "activeAliases", // Record<origin, AliasRecord>
  managedAliases: "managedAliases", // Record<aliasId, AliasRecord>
  activePollers: "activePollers", // Record<aliasId, PollerState>
} as const;

export interface PollerState {
  aliasId: string;
  pollToken: string;
  startedAt: number;
  nextPollAt: number;
  attempt: number;
  consecutiveFailures: number;
  lastSince: number;
}

async function get<T>(key: string): Promise<T | undefined> {
  const obj = await chrome.storage.local.get(key);
  return obj[key] as T | undefined;
}
async function set<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

/* ------------------------------ Settings ------------------------------- */

export async function getSettings(): Promise<UserSettings> {
  const raw = (await get<Partial<UserSettings>>(K.settings)) ?? {};
  return { ...DEFAULT_SETTINGS, ...raw };
}
export async function setSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
  const cur = await getSettings();
  const next: UserSettings = { ...cur, ...patch };
  await set(K.settings, next);
  return next;
}
export async function initSettingsIfAbsent(): Promise<void> {
  const raw = await get<Partial<UserSettings>>(K.settings);
  if (!raw) await set(K.settings, DEFAULT_SETTINGS);
}

/* --------------------------- Active aliases --------------------------- */

export async function getActiveAliases(): Promise<Record<string, AliasRecord>> {
  return (await get<Record<string, AliasRecord>>(K.activeAliases)) ?? {};
}
export async function putActiveAlias(record: AliasRecord): Promise<void> {
  const map = await getActiveAliases();
  if (record.origin) map[record.origin] = record;
  await set(K.activeAliases, map);
}
export async function removeActiveAliasByAliasId(aliasId: string): Promise<void> {
  const map = await getActiveAliases();
  for (const origin of Object.keys(map)) {
    if (map[origin]?.aliasId === aliasId) delete map[origin];
  }
  await set(K.activeAliases, map);
}

/* --------------------------- Managed aliases --------------------------- */

export async function getManagedAliases(): Promise<Record<string, AliasRecord>> {
  return (await get<Record<string, AliasRecord>>(K.managedAliases)) ?? {};
}
export async function putManagedAlias(record: AliasRecord): Promise<void> {
  const map = await getManagedAliases();
  map[record.aliasId] = record;
  await set(K.managedAliases, map);
}
export async function removeManagedAlias(aliasId: string): Promise<void> {
  const map = await getManagedAliases();
  delete map[aliasId];
  await set(K.managedAliases, map);
}

/* ---------------------------- Active pollers --------------------------- */

export async function getActivePollers(): Promise<Record<string, PollerState>> {
  return (await get<Record<string, PollerState>>(K.activePollers)) ?? {};
}
export async function putPollerState(state: PollerState): Promise<void> {
  const map = await getActivePollers();
  map[state.aliasId] = state;
  await set(K.activePollers, map);
}
export async function removePollerState(aliasId: string): Promise<void> {
  const map = await getActivePollers();
  delete map[aliasId];
  await set(K.activePollers, map);
}
