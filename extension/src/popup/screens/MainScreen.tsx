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
import type { ErrorCode } from "../../lib/messaging.js";
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
    if (!origin) return;
    const res = await sendRuntime<{ ok: boolean; error?: string }>({
      type: "GENERATE_ALIAS",
      mode: settings.managedModeEnabled ? "managed" : "ephemeral",
      origin,
    });
    if (res && !res.ok) setError((res.error as ErrorCode) ?? "unknown");
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
            <div class="sm-section-label">{t.main.sectionAddress}</div>
            <div class="sm-address-box">
              <span>{activeAlias.address}</span>
              <button type="button" onClick={handleCopyAddress}>
                {t.main.copy}
              </button>
            </div>
            <div class="sm-section-label">{t.main.sectionOtp}</div>
            {latest?.otp ? (
              <OtpBox
                otp={latest.otp}
                confidence={latest.confidence}
                autoCopy={settings.autoCopyOtp}
                messageId={latest.id}
                onConsumed={handleConsumed}
              />
            ) : (
              <LoadingSkeleton />
            )}
            {latest?.verifyLinks?.[0] ? (
              <Fragment>
                <div class="sm-section-label">{t.main.sectionVerify}</div>
                <VerifyLinkButton
                  url={latest.verifyLinks[0]}
                  messageId={latest.id}
                  onConsumed={handleConsumed}
                />
              </Fragment>
            ) : null}
            <button type="button" class="sm-btn secondary" onClick={() => void handleGenerate()}>
              {t.main.generateNew}
            </button>
            {settings.managedModeEnabled ? (
              <button
                type="button"
                class="sm-btn ghost"
                onClick={() => navigate("managed")}
              >
                {t.main.openManaged}
              </button>
            ) : null}
          </Fragment>
        )}
      </div>
      <PrivacyFooter expiresAt={activeAlias?.expiresAt ?? null} />
    </div>
  );
}
