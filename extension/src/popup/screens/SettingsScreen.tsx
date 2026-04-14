import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { PrivacyFooter } from "../components/PrivacyFooter.js";
import { getMessages } from "../i18n/index.js";
import { useSettings } from "../state/store.js";
import { getOrCreateDeviceId } from "../../lib/device.js";
import type { Screen } from "../App.js";

export interface SettingsScreenProps {
  navigate: (s: Screen) => void;
}

const t = getMessages();

export function SettingsScreen({ navigate }: SettingsScreenProps) {
  const [settings, update] = useSettings();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTier, setAdminTier] = useState<"free" | "pro">("pro");
  const [adminLoading, setAdminLoading] = useState(false);

  const version =
    typeof chrome !== "undefined" && chrome.runtime?.getManifest
      ? chrome.runtime.getManifest().version
      : "0.1.0";

  // Check admin status on mount.
  useEffect(() => {
    void (async () => {
      try {
        const deviceId = await getOrCreateDeviceId();
        const apiBase = settings.apiBaseUrl.replace(/\/$/, "");
        const resp = await fetch(`${apiBase}/admin/check?deviceId=${encodeURIComponent(deviceId)}`);
        if (resp.ok) {
          const data = (await resp.json()) as { admin: boolean };
          setIsAdmin(data.admin);
        }
      } catch {}
    })();
  }, []);

  const handleAdminTierToggle = async (): Promise<void> => {
    setAdminLoading(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      const apiBase = settings.apiBaseUrl.replace(/\/$/, "");
      const newTier = adminTier === "pro" ? "free" : "pro";
      const resp = await fetch(`${apiBase}/admin/set-tier`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId, tier: newTier }),
      });
      if (resp.ok) {
        setAdminTier(newTier);
      }
    } catch {}
    setAdminLoading(false);
  };

  const resetOnboarding = async (): Promise<void> => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ onboardingCompleted: false });
    }
    navigate("onboarding");
  };

  return (
    <div class="sm-app">
      <header class="sm-header">
        <h1>
          <button
            type="button"
            class="icon-btn"
            aria-label={t.header.back}
            onClick={() => navigate("main")}
          >
            ←
          </button>
          {t.settings.title}
        </h1>
      </header>
      <div class="sm-body">
        <div class="sm-settings-row">
          <label>{t.settings.autoCopy}</label>
          <button
            type="button"
            class="sm-toggle"
            data-on={settings.autoCopyOtp}
            aria-pressed={settings.autoCopyOtp}
            onClick={() => void update({ autoCopyOtp: !settings.autoCopyOtp })}
          />
        </div>
        <div
          class="sm-settings-row"
          style={{ cursor: "pointer" }}
          onClick={() => navigate("subscription")}
          role="button"
          tabIndex={0}
        >
          <label>{t.settings.subscription}</label>
          <small style={{ color: "var(--sm-text-secondary)" }}>→</small>
        </div>

        {/* Admin-only: tier toggle for testing */}
        {isAdmin && (
          <div class="sm-settings-row" style={{ background: "var(--sm-surface-elevated)", borderRadius: "8px", padding: "8px 12px", margin: "8px 0" }}>
            <label style={{ color: "#FF9500" }}>관리자 테스트 모드</label>
            <button
              type="button"
              class="sm-btn"
              style={{ fontSize: "12px", padding: "4px 12px", minWidth: "auto" }}
              disabled={adminLoading}
              onClick={() => void handleAdminTierToggle()}
            >
              {adminTier === "pro" ? "Pro → Free 전환" : "Free → Pro 전환"}
            </button>
          </div>
        )}

        <div class="sm-settings-row">
          <label>{t.settings.version}</label>
          <small>{version}</small>
        </div>
        <button type="button" class="sm-btn secondary" onClick={() => void resetOnboarding()}>
          {t.settings.resetOnboarding}
        </button>
      </div>
      <PrivacyFooter />
    </div>
  );
}
