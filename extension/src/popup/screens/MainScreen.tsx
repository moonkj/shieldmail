import { h, Fragment } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { ShieldLogo } from "../components/ShieldLogo.js";
import { OtpBox } from "../components/OtpBox.js";
import { VerifyLinkButton } from "../components/VerifyLinkButton.js";
import { PrivacyFooter } from "../components/PrivacyFooter.js";
import { LoadingSkeleton } from "../components/LoadingSkeleton.js";
import { ErrorCard } from "../components/ErrorCard.js";
import { getMessages } from "../i18n/index.js";
import {
  getActiveTabOrigin,
  onRuntimeMessage,
  useActiveAliases,
  useSettings,
} from "../state/store.js";
import { sendRuntime } from "../../lib/messaging.js";
import type { ErrorCode, SseActiveMessage, SseInactiveMessage } from "../../lib/messaging.js";
import type { AliasRecord, ExtractedMessage, RuntimeMessage } from "../../lib/types.js";
import type { Screen } from "../App.js";

export interface MainScreenProps {
  navigate: (s: Screen) => void;
}

const t = getMessages();

export function MainScreen({ navigate }: MainScreenProps) {
  const [settings] = useSettings();
  const aliases = useActiveAliases();
  const [origin, setOrigin] = useState<string | null>(null);
  const [messages, setMessages] = useState<ExtractedMessage[]>([]);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [now, setNow] = useState(Date.now());

  // Countdown tick for inline TTL display
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void getActiveTabOrigin().then(setOrigin);
  }, []);

  const activeAlias: AliasRecord | undefined = useMemo(
    () => aliases.find((a) => a.origin === origin) ?? aliases[0],
    [aliases, origin],
  );

  // Fetch messages for the active alias whenever it changes.
  useEffect(() => {
    if (!activeAlias) return;
    let mounted = true;
    void sendRuntime<{ ok: boolean; messages?: ExtractedMessage[]; error?: string }>({
      type: "FETCH_MESSAGES",
      aliasId: activeAlias.aliasId,
    }).then((res) => {
      if (!mounted || !res) return;
      if (res.ok && res.messages) {
        const incoming = res.messages;
        setMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m]));
          for (const m of incoming) byId.set(m.id, m);
          return [...byId.values()].sort((a, b) => b.receivedAt - a.receivedAt);
        });
      } else if (!res.ok && res.error) setError((res.error as ErrorCode) ?? "unknown");
    });
    return () => {
      mounted = false;
    };
  }, [activeAlias?.aliasId]);

  // Live subscribe to FETCH_MESSAGES_RESULT broadcast pushes.
  useEffect(() => {
    return onRuntimeMessage((raw) => {
      const msg = raw as RuntimeMessage;
      if (msg.type === "FETCH_MESSAGES_RESULT" && msg.ok) {
        const incoming = msg.messages;
        setMessages((prev) => {
          const byId = new Map(prev.map((m) => [m.id, m]));
          for (const m of incoming) byId.set(m.id, m);
          return [...byId.values()].sort((a, b) => b.receivedAt - a.receivedAt);
        });
        setError(null);
      } else if (msg.type === "FETCH_MESSAGES_RESULT" && !msg.ok) {
        setError((msg.error as ErrorCode) ?? "unknown");
      }
    });
  }, []);

  // SSE direct connection to DO /stream endpoint.
  // While connected: background alarm poller is paused (SSE_ACTIVE).
  // On close/error: background polling resumes (SSE_INACTIVE).
  useEffect(() => {
    if (!activeAlias) return;
    const aliasId = activeAlias.aliasId;
    const pollToken = activeAlias.pollToken;
    // pollToken may be absent on legacy records — fall back to background polling.
    if (!pollToken) return;

    let es: EventSource | null = null;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = (): void => {
      if (cancelled) return;
      // Last-Event-ID is set automatically by EventSource on reconnect.
      const base = settings.apiBaseUrl.replace(/\/$/, "");
      const url = new URL(`${base}/alias/${aliasId}/stream`);
      url.searchParams.set("token", pollToken);
      es = new EventSource(url.toString());

      es.addEventListener("open", () => {
        retryCount = 0;
        void sendRuntime<void>({ type: "SSE_ACTIVE", aliasId } as SseActiveMessage);
      });

      es.addEventListener("message", (e: MessageEvent<string>) => {
        try {
          const msg = JSON.parse(e.data) as ExtractedMessage;
          if (!msg.id || !msg.receivedAt) return;
          setMessages((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            byId.set(msg.id, msg);
            return [...byId.values()].sort((a, b) => b.receivedAt - a.receivedAt);
          });
          setError(null);
        } catch { /* malformed frame — ignore */ }
      });

      es.addEventListener("error", () => {
        es?.close();
        es = null;
        if (cancelled) return;
        retryCount += 1;
        if (retryCount > MAX_RETRIES) {
          void sendRuntime<void>({ type: "SSE_INACTIVE", aliasId } as SseInactiveMessage);
          return;
        }
        const delay = Math.min(30_000, 1_000 * Math.pow(2, retryCount - 1));
        retryTimer = setTimeout(connect, delay);
      });
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      es?.close();
      void sendRuntime<void>({ type: "SSE_INACTIVE", aliasId } as SseInactiveMessage);
    };
  }, [activeAlias?.aliasId]);

  // CRITICAL: scrub in-memory OTP state on unmount.
  useEffect(() => {
    return () => {
      setMessages([]);
    };
  }, []);

  const latest = messages[0];

  const handleConsumed = (messageId: string): void => {
    if (!activeAlias) return;
    void sendRuntime({
      type: "ACK_MESSAGE",
      aliasId: activeAlias.aliasId,
      messageId,
    });
  };

  const handleGenerate = async (): Promise<void> => {
    // origin may be null in iOS popup contexts where chrome.tabs.query
    // doesn't return the active web page (e.g., Settings tabs). Synthesize
    // a placeholder so generate still works for end-to-end UI verification.
    const effectiveOrigin = origin ?? "https://demo.local";

    try {
      const res = await sendRuntime<{ ok: boolean; error?: string; record?: AliasRecord }>({
        type: "GENERATE_ALIAS",
        mode: settings.managedModeEnabled ? "managed" : "ephemeral",
        origin: effectiveOrigin,
      });
      if (res?.ok && res.record) return;
      if (res && !res.ok) {
        setError((res.error as ErrorCode) ?? "unknown");
        return;
      }
      // res === undefined → SW silent. In dev builds, fall through to the
      // popup-side demo fallback below. In production, surface an error.
      if (!__SHIELDMAIL_DEV__) {
        setError("network_unavailable");
        return;
      }
    } catch {
      if (!__SHIELDMAIL_DEV__) {
        setError("unknown");
        return;
      }
    }

    // DEV-ONLY POPUP-SIDE DEMO FALLBACK: synthesize alias + OTP entirely
    // in popup so the UI flow can be exercised without the background SW.
    // This entire block is dead code in production builds (constant folded).
    if (!__SHIELDMAIL_DEV__) return;
    try {
      const buf = new Uint8Array(7);
      crypto.getRandomValues(buf);
      const aliasId = Array.from(buf, (b) => b.toString(16).padStart(2, "0"))
        .join("")
        .slice(0, 14);
      const domains = ["d1.shld.me", "d2.shld.me", "d3.shld.me", "d4.shld.me", "d5.shld.me"];
      const domain = domains[Math.floor(Math.random() * domains.length)] ?? "d1.shld.me";
      const record: AliasRecord = {
        aliasId,
        address: `${aliasId}@${domain}`,
        expiresAt: Date.now() + 60 * 60 * 1000,
        pollToken: `demo:${aliasId}`,
        mode: settings.managedModeEnabled ? "managed" : "ephemeral",
        createdAt: Date.now(),
        origin: effectiveOrigin,
      };

      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const cur = (await chrome.storage.local.get("activeAliases")) as {
          activeAliases?: Record<string, AliasRecord>;
        };
        const next = { ...(cur.activeAliases ?? {}), [aliasId]: record };
        await chrome.storage.local.set({ activeAliases: next });
      }

      const fakeOtp = String(Math.floor(100000 + Math.random() * 900000));
      setMessages([
        {
          id: `demo-${Date.now()}`,
          otp: fakeOtp,
          confidence: 0.95,
          receivedAt: Date.now(),
          verifyLinks: ["https://demo.local/verify/demo"],
        },
      ]);
    } catch {
      setError("unknown");
    }
  };

  const formatCountdown = (expiresAt: number): string => {
    const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const handleCopyAddress = (): void => {
    if (!activeAlias) return;
    void navigator.clipboard?.writeText(activeAlias.address);
  };

  return (
    <div class="sm-app">
      <header class="sm-header">
        <h1>
          <ShieldLogo size={22} />
          {t.appTitle}
        </h1>
        <button
          type="button"
          class="icon-btn"
          aria-label={t.header.settings}
          onClick={() => navigate("settings")}
        >
          ⚙
        </button>
      </header>
      <div class="sm-body">
        {error ? (
          <ErrorCard
            code={error}
            onRetry={() => {
              setError(null);
              void handleGenerate();
            }}
            onNewAlias={() => {
              setError(null);
              void handleGenerate();
            }}
            onFallback={() => setError(null)}
          />
        ) : !activeAlias ? (
          <Fragment>
            <p class="sm-empty">{t.main.emptyState}</p>
            <button type="button" class="sm-btn" onClick={() => void handleGenerate()}>
              {t.main.generateNew}
            </button>
          </Fragment>
        ) : (
          <Fragment>
            {/* ── Address Card ── */}
            <div class="sm-card">
              <div class="sm-section-label">{t.main.sectionAddress}</div>
              <div class="sm-address-box">
                <span>{activeAlias.address}</span>
                <button type="button" onClick={handleCopyAddress}>
                  {t.main.copy}
                </button>
              </div>
              {activeAlias.expiresAt ? (
                <div class="sm-ttl-inline">
                  {t.main.ttlRemaining(formatCountdown(activeAlias.expiresAt))}
                </div>
              ) : null}
            </div>

            {/* ── OTP / Status Card ── */}
            <div class="sm-card">
              {latest?.otp ? (
                <Fragment>
                  <div class="sm-section-label">{t.main.sectionOtp}</div>
                  <OtpBox
                    otp={latest.otp}
                    confidence={latest.confidence}
                    autoCopy={settings.autoCopyOtp}
                    messageId={latest.id}
                    onConsumed={handleConsumed}
                  />
                  {latest.verifyLinks?.[0] ? (
                    <VerifyLinkButton
                      url={latest.verifyLinks[0]}
                      messageId={latest.id}
                      onConsumed={handleConsumed}
                    />
                  ) : null}
                </Fragment>
              ) : (
                <Fragment>
                  <div class="sm-section-label">{t.main.waiting}</div>
                  <LoadingSkeleton />
                </Fragment>
              )}
            </div>

            {/* ── Actions ── */}
            <button type="button" class="sm-btn secondary" onClick={() => void handleGenerate()}>
              {t.main.generateNew}
            </button>
          </Fragment>
        )}
      </div>
      <PrivacyFooter />
    </div>
  );
}
