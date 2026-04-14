/**
 * Vitest global setup — hermetic chrome.* stubs and DOM helpers.
 * Runs before every test file via vite.config.ts `setupFiles`.
 */
import { vi, beforeEach, afterEach } from "vitest";

type Listener = (...args: unknown[]) => unknown;

function makeEvent() {
  const listeners = new Set<Listener>();
  return {
    addListener: (fn: Listener) => listeners.add(fn),
    removeListener: (fn: Listener) => listeners.delete(fn),
    hasListener: (fn: Listener) => listeners.has(fn),
    _emit: (...args: unknown[]) => listeners.forEach((fn) => fn(...args)),
    _listeners: listeners,
  };
}

function makeStorageArea() {
  const store = new Map<string, unknown>();
  return {
    _store: store,
    get: vi.fn(async (keys?: string | string[] | Record<string, unknown> | null) => {
      if (keys == null) return Object.fromEntries(store);
      if (typeof keys === "string") {
        return store.has(keys) ? { [keys]: store.get(keys) } : {};
      }
      if (Array.isArray(keys)) {
        const out: Record<string, unknown> = {};
        for (const k of keys) if (store.has(k)) out[k] = store.get(k);
        return out;
      }
      const out: Record<string, unknown> = { ...keys };
      for (const k of Object.keys(keys)) if (store.has(k)) out[k] = store.get(k);
      return out;
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) store.set(k, v);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys];
      for (const k of arr) store.delete(k);
    }),
    clear: vi.fn(async () => store.clear()),
  };
}

function buildChromeStub() {
  return {
    runtime: {
      id: "shieldmail-test",
      sendMessage: vi.fn(async () => ({ ok: true })),
      onMessage: makeEvent(),
      onInstalled: makeEvent(),
      onStartup: makeEvent(),
      getURL: (p: string) => `chrome-extension://test/${p}`,
      lastError: undefined as undefined | { message: string },
    },
    storage: {
      local: makeStorageArea(),
      session: makeStorageArea(),
      sync: makeStorageArea(),
      onChanged: makeEvent(),
    },
    tabs: {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(async () => ({})),
      create: vi.fn(async () => ({})),
      onUpdated: makeEvent(),
      onRemoved: makeEvent(),
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(async () => true),
      clearAll: vi.fn(async () => true),
      get: vi.fn(async () => undefined),
      onAlarm: makeEvent(),
    },
    commands: {
      onCommand: makeEvent(),
      getAll: vi.fn(async () => []),
    },
    notifications: {
      create: vi.fn(async () => "id"),
      clear: vi.fn(async () => true),
      onClicked: makeEvent(),
    },
    action: {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
      setIcon: vi.fn(async () => undefined),
    },
  };
}

beforeEach(() => {
  vi.stubGlobal("chrome", buildChromeStub());
  // navigator.clipboard stub — happy-dom doesn't implement it by default.
  if (!("clipboard" in navigator)) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => undefined) },
    });
  } else {
    (navigator.clipboard as { writeText: unknown }).writeText = vi.fn(async () => undefined);
  }
});

afterEach(() => {
  // NOTE: vi.unstubAllGlobals() is intentionally omitted here.
  // It would remove the `chrome` global before _render.ts's afterEach can
  // unmount Preact components, causing "chrome is not defined" in useEffect
  // cleanup functions. The beforeEach above re-creates a fresh chrome stub
  // each test, so stale state is never leaked.
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});
