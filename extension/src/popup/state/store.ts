// Lightweight popup state: chrome.storage-backed settings + alias cache.
// Exposes React-ish hooks via preact/hooks. NO logging of OTP or address.

import { useEffect, useState } from "preact/hooks";
import {
  DEFAULT_SETTINGS,
  type AliasRecord,
  type ExtractedMessage,
  type UserSettings,
} from "../../lib/types.js";

interface StorageShape {
  settings?: UserSettings;
  activeAliases?: Record<string, AliasRecord>;
  managedAliases?: Record<string, AliasRecord>;
}

async function readStorage(): Promise<StorageShape> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return {};
  return (await chrome.storage.local.get([
    "settings",
    "activeAliases",
    "managedAliases",
  ])) as StorageShape;
}

export async function writeSettings(patch: Partial<UserSettings>): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  const current = (await chrome.storage.local.get("settings")) as {
    settings?: UserSettings;
  };
  const next: UserSettings = { ...DEFAULT_SETTINGS, ...current.settings, ...patch };
  await chrome.storage.local.set({ settings: next });
}

export function useSettings(): [UserSettings, (patch: Partial<UserSettings>) => Promise<void>] {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let mounted = true;
    void readStorage().then((s) => {
      if (mounted && s.settings) setSettings({ ...DEFAULT_SETTINGS, ...s.settings });
    });
    const listener = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: string,
    ): void => {
      if (area !== "local" || !changes.settings) return;
      const nv = changes.settings.newValue as UserSettings | undefined;
      if (nv) setSettings({ ...DEFAULT_SETTINGS, ...nv });
    };
    chrome.storage?.onChanged.addListener(listener);
    return () => {
      mounted = false;
      chrome.storage?.onChanged.removeListener(listener);
    };
  }, []);

  const update = async (patch: Partial<UserSettings>): Promise<void> => {
    await writeSettings(patch);
    setSettings((prev) => ({ ...prev, ...patch }));
  };
  return [settings, update];
}

export function useActiveAliases(): AliasRecord[] {
  const [aliases, setAliases] = useState<AliasRecord[]>([]);
  useEffect(() => {
    let mounted = true;
    void readStorage().then((s) => {
      if (mounted) setAliases(Object.values(s.activeAliases ?? {}));
    });
    const listener = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: string,
    ): void => {
      if (area !== "local" || !changes.activeAliases) return;
      setAliases(
        Object.values(
          (changes.activeAliases.newValue as Record<string, AliasRecord>) ?? {},
        ),
      );
    };
    chrome.storage?.onChanged.addListener(listener);
    return () => {
      mounted = false;
      chrome.storage?.onChanged.removeListener(listener);
    };
  }, []);
  return aliases;
}

export function useManagedAliases(): AliasRecord[] {
  const [aliases, setAliases] = useState<AliasRecord[]>([]);
  useEffect(() => {
    let mounted = true;
    void readStorage().then((s) => {
      if (mounted) setAliases(Object.values(s.managedAliases ?? {}));
    });
    const listener = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: string,
    ): void => {
      if (area !== "local" || !changes.managedAliases) return;
      setAliases(
        Object.values(
          (changes.managedAliases.newValue as Record<string, AliasRecord>) ?? {},
        ),
      );
    };
    chrome.storage?.onChanged.addListener(listener);
    return () => {
      mounted = false;
      chrome.storage?.onChanged.removeListener(listener);
    };
  }, []);
  return aliases;
}

/** Returns the URL origin of the currently-active tab, or null. */
export async function getActiveTabOrigin(): Promise<string | null> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return null;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export async function getActiveTabId(): Promise<number | null> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return null;
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id ?? null;
}

/** Subscribe to runtime messages; returns cleanup fn. */
export function onRuntimeMessage(
  handler: (msg: unknown) => void,
): () => void {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return () => {};
  }
  const listener = (msg: unknown): void => handler(msg);
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

/** In-memory ephemeral OTP state used by MainScreen. Cleared on unmount. */
export interface LiveMessageState {
  messages: ExtractedMessage[];
  expired: boolean;
}
