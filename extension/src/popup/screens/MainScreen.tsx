import { h, Fragment } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { ShieldLogo } from "../components/ShieldLogo.js";
import { OtpBox } from "../components/OtpBox.js";
import { VerifyLinkButton } from "../components/VerifyLinkButton.js";
import { PrivacyFooter } from "../components/PrivacyFooter.js";
import { LoadingSkeleton } from "../components/LoadingSkeleton.js";
import { ErrorCard } from "../components/ErrorCard.js";
import { UsageBadge } from "../components/UsageBadge.js";
import { LimitSheet } from "../components/LimitSheet.js";
import { getMessages } from "../i18n/index.js";
import {
  getActiveTabId,
  getActiveTabOrigin,
  onRuntimeMessage,
  useActiveAliases,
  useSettings,
} from "../state/store.js";
import { sendRuntime } from "../../lib/messaging.js";
import { getOrCreateDeviceId } from "../../lib/device.js";
import { getSubscriptionState } from "../../lib/subscription.js";
import type { ErrorCode, SseActiveMessage, SseInactiveMessage } from "../../lib/messaging.js";
import type { AliasRecord, ExtractedMessage, RuntimeMessage, SubscriptionTier } from "../../lib/types.js";
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
  const [generating, setGenerating] = useState(false);
  const [addressCopied, setAddressCopied] = useState(false);
  const [now, setNow] = useState(Date.now());
  // Alias fetched directly from content script (bypasses storage + background).
  const [contentAlias, setContentAlias] = useState<AliasRecord | null>(null);

  // ── Usage / Subscription state ──
  const [usageUsed, setUsageUsed] = useState(0);
  const [usageLimit, setUsageLimit] = useState(1);
  const [usageTier, setUsageTier] = useState<SubscriptionTier>("free");
  const [showLimitSheet, setShowLimitSheet] = useState(false);

  // Countdown tick for inline TTL display
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    void getActiveTabOrigin().then(setOrigin);
  }, []);

  // On mount: ask the content script for the alias it generated via the shield
  // button. Uses chrome.tabs.sendMessage → content script's onMessage handler.
  // This bypasses both chrome.storage and background SW entirely.
  useEffect(() => {
    void (async () => {
      try {
        const tabId = await getActiveTabId();
        if (!tabId) return;
        const resp = await chrome.tabs.sendMessage(tabId, { type: "GET_ACTIVE_ALIAS" }) as
          | { ok: true; record: AliasRecord; usage?: { remaining?: number; limit?: number; tier?: string } }
          | { ok: false };
        if (resp?.ok && resp.record?.address) {
          setContentAlias(resp.record);
          // Sync usage from content script.
          if (resp.usage) {
            if (typeof resp.usage.remaining === "number" && typeof resp.usage.limit === "number") {
              setUsageUsed(resp.usage.limit - resp.usage.remaining);
              setUsageLimit(resp.usage.limit);
            }
            if (resp.usage.tier === "free" || resp.usage.tier === "pro") {
              setUsageTier(resp.usage.tier);
            }
          }
          // Also save to storage so polling and other features work.
          if (chrome.storage?.local) {
            const cur = (await chrome.storage.local.get("activeAliases")) as {
              activeAliases?: Record<string, AliasRecord>;
            };
            const next = { ...(cur.activeAliases ?? {}), [resp.record.aliasId]: resp.record };
            await chrome.storage.local.set({ activeAliases: next });
          }
        }
      } catch { /* content script may not be injected on this page */ }
    })();
  }, []);

  const activeAlias: AliasRecord | undefined = useMemo(
    () => contentAlias ?? aliases.find((a) => a.origin === origin) ?? aliases[0],
    [contentAlias, aliases, origin],
  );

  // Poll messages directly from the Worker API (bypasses background SW).
  // Polls every 3s while popup is open, stops when OTP arrives or alias expires.
  useEffect(() => {
    if (!activeAlias?.pollToken) return;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async (): Promise<void> => {
      if (!mounted) return;
      try {
        const apiBase = settings.apiBaseUrl.replace(/\/$/, "");
        const resp = await fetch(
          `${apiBase}/alias/${encodeURIComponent(activeAlias.aliasId)}/messages`,
          { headers: { authorization: `Bearer ${activeAlias.pollToken}` } },
        );
        if (!resp.ok || !mounted) return;
        const data = (await resp.json()) as { messages: ExtractedMessage[]; expired: boolean };
        if (!mounted) return;
        if (data.messages.length > 0) {
          setMessages((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            for (const m of data.messages) byId.set(m.id, m);
            return [...byId.values()].sort((a, b) => b.receivedAt - a.receivedAt);
          });
          setError(null);
          // Send OTP to content script for auto-fill into the page's code field.
          try {
            const tabId = await getActiveTabId();
            if (tabId) {
              void chrome.tabs.sendMessage(tabId, {
                type: "FETCH_MESSAGES_RESULT",
                ok: true,
                messages: data.messages,
              });
            }
          } catch { /* best-effort */ }
          return; // Stop polling — OTP arrived.
        }
        if (data.expired) return; // Stop polling.
      } catch {
        // Network error — retry on next tick.
      }
      if (mounted) timer = setTimeout(poll, 3000);
    };

    void poll();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [activeAlias?.aliasId, activeAlias?.pollToken]);

  // Background broadcast listener removed — popup polls the Worker API
  // directly via the useEffect above (3s interval). This bypasses the
  // background SW which is unreliable on iOS Safari.

  // SSE removed — direct polling above handles message fetching.
  // SSE requires background SW for SSE_ACTIVE/INACTIVE coordination,
  // which is unreliable on iOS Safari.

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
    // Block generation if limit already exceeded (local check).
    if (usageTier === "free" && usageUsed >= usageLimit) {
      setShowLimitSheet(true);
      return;
    }

    const effectiveOrigin = origin ?? "https://demo.local";
    setGenerating(true);

    try {
      // Direct API call from popup — bypasses background SW which is
      // unreliable on iOS Safari. The popup has network access via
      // host_permissions: ["https://*/*"].
      const apiBase = settings.apiBaseUrl.replace(/\/$/, "");
      const mode = settings.managedModeEnabled ? "managed" : "ephemeral";

      const [deviceId, sub] = await Promise.all([
        getOrCreateDeviceId(),
        getSubscriptionState(),
      ]);

      const reqBody: Record<string, unknown> = {
        mode,
        label: document.title.slice(0, 64),
        deviceId,
      };
      if (sub.jws) reqBody.subscriptionJWS = sub.jws;

      const resp = await fetch(`${apiBase}/alias/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(reqBody),
      });

      // Handle 403 daily_limit_exceeded
      if (resp.status === 403) {
        try {
          const errData = (await resp.json()) as { code?: string; error?: string; remaining?: number; limit?: number; tier?: string };
          if (errData.error === "daily_limit_exceeded") {
            if (typeof errData.remaining === "number") setUsageUsed(errData.limit ?? usageLimit);
            if (typeof errData.limit === "number") setUsageLimit(errData.limit);
            if (errData.tier === "free" || errData.tier === "pro") setUsageTier(errData.tier);
            setShowLimitSheet(true);
            return;
          }
        } catch { /* fallthrough to generic error */ }
        setError("unknown");
        return;
      }

      if (!resp.ok) {
        setError("unknown");
        return;
      }

      const data = (await resp.json()) as {
        aliasId: string;
        address: string;
        expiresAt: number | null;
        pollToken: string;
        remaining?: number;
        limit?: number;
        tier?: string;
      };

      // Update usage state from API response.
      if (typeof data.remaining === "number" && typeof data.limit === "number") {
        setUsageUsed(data.limit - data.remaining);
        setUsageLimit(data.limit);
      }
      if (data.tier === "free" || data.tier === "pro") {
        setUsageTier(data.tier);
      }

      const record: AliasRecord = {
        aliasId: data.aliasId,
        address: data.address,
        expiresAt: data.expiresAt ? data.expiresAt * 1000 : null,
        pollToken: data.pollToken,
        mode,
        createdAt: Date.now(),
        origin: effectiveOrigin,
      };

      // Save to storage so useActiveAliases picks it up.
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const cur = (await chrome.storage.local.get("activeAliases")) as {
          activeAliases?: Record<string, AliasRecord>;
        };
        const next = { ...(cur.activeAliases ?? {}), [record.aliasId]: record };
        await chrome.storage.local.set({ activeAliases: next });
      }
    } catch {
      setError("network_unavailable");
    } finally {
      setGenerating(false);
    }
  };

  const formatCountdown = (expiresAt: number): string => {
    const diff = Math.max(0, Math.floor((expiresAt - now) / 1000));
    const m = Math.floor(diff / 60);
    const s = diff % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isExpired = activeAlias?.expiresAt ? activeAlias.expiresAt <= now : false;

  const handleCopyAddress = (): void => {
    if (!activeAlias) return;
    void navigator.clipboard?.writeText(activeAlias.address).then(() => {
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 1500);
    });
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
        <UsageBadge used={usageUsed} limit={usageLimit} tier={usageTier} />
        {error ? (
          <ErrorCard
            code={error}
            onRetry={() => { setError(null); void handleGenerate(); }}
            onNewAlias={() => { setError(null); void handleGenerate(); }}
            onFallback={() => setError(null)}
          />
        ) : generating ? (
          <div class="sm-card">
            <LoadingSkeleton />
          </div>
        ) : !activeAlias ? (
          <p class="sm-empty">{t.main.emptyState}</p>
        ) : (
          <Fragment>
            {/* ── Address Card ── */}
            <div class={`sm-card${isExpired ? " expired" : ""}`}>
              <div class="sm-section-label">{t.main.sectionAddress}</div>
              <div class="sm-address-box">
                <span>{activeAlias.address}</span>
                <button type="button" class="sm-copy-btn" onClick={handleCopyAddress}>
                  {addressCopied ? "✓" : t.main.copy}
                </button>
              </div>
              {activeAlias.expiresAt ? (
                <div class={`sm-ttl-inline${isExpired ? " expired" : ""}`}>
                  {isExpired ? t.main.expired : t.main.ttlRemaining(formatCountdown(activeAlias.expiresAt))}
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

            {/* Generate removed — alias is created via shield button only */}
          </Fragment>
        )}
      </div>
      {showLimitSheet && (
        <LimitSheet
          navigate={navigate}
          onDismiss={() => setShowLimitSheet(false)}
        />
      )}
      <PrivacyFooter />
    </div>
  );
}
