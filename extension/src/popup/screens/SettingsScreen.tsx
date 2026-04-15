import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { PrivacyFooter } from "../components/PrivacyFooter.js";
import { getMessages } from "../i18n/index.js";
import { useSettings } from "../state/store.js";
import { getOrCreateDeviceId } from "../../lib/device.js";
import { getActiveTabId } from "../state/store.js";
import type { Screen } from "../App.js";

export interface SettingsScreenProps {
  navigate: (s: Screen) => void;
}

const t = getMessages();

interface AdminStats {
  freeThisWeek: number;
  freeTotal: number;
  proThisMonth: number;
}

export function SettingsScreen({ navigate }: SettingsScreenProps) {
  const [settings, update] = useSettings();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTier, setAdminTier] = useState<"free" | "pro">("pro");
  const [adminLoading, setAdminLoading] = useState(false);
  const [secret, setSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [tapState, setTapState] = useState({ count: 0, lastTap: 0 });
  const [stats, setStats] = useState<AdminStats | null>(null);

  const version =
    typeof chrome !== "undefined" && chrome.runtime?.getManifest
      ? chrome.runtime.getManifest().version
      : "0.1.0";

  useEffect(() => {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        void chrome.storage.local.get(["adminMode", "adminTier"]).then((r: Record<string, unknown>) => {
          if ((r as { adminMode?: boolean }).adminMode) {
            setIsAdmin(true);
            const t = (r as { adminTier?: string }).adminTier;
            if (t === "free" || t === "pro") setAdminTier(t);
            void loadStats();
          }
        });
      }
    } catch {}
  }, []);

  const handleVersionTap = (): void => {
    if (isAdmin) return; // already admin
    const now = Date.now();
    const newCount = (now - tapState.lastTap < 2000) ? tapState.count + 1 : 1;
    setTapState({ count: newCount, lastTap: now });
    if (newCount >= 5) {
      setShowSecret(true);
      setTapState({ count: 0, lastTap: 0 });
    }
  };

  const handleSecretSubmit = async (): Promise<void> => {
    if (!secret.trim()) return;
    setAdminLoading(true);
    try {
      const apiBase = settings.apiBaseUrl.replace(/\/$/, "");
      const resp = await fetch(`${apiBase}/admin/auth`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: secret.trim() }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { admin: boolean };
        if (data.admin) {
          setIsAdmin(true);
          setShowSecret(false);
          try { await chrome.storage?.local?.set({ adminMode: true, adminSecret: secret.trim(), adminTier: "pro" }); } catch {}
          void loadStats();
        }
      }
    } catch {}
    setAdminLoading(false);
  };

  const handleAdminLogout = async (): Promise<void> => {
    setIsAdmin(false);
    setShowSecret(false);
    setStats(null);
    try { await chrome.storage?.local?.remove(["adminMode", "adminSecret", "adminTier"]); } catch {}
  };

  const handleSetTier = async (newTier: "free" | "pro"): Promise<void> => {
    if (newTier === adminTier) return;
    setAdminLoading(true);
    try {
      const deviceId = await getOrCreateDeviceId();
      const apiBase = settings.apiBaseUrl.replace(/\/$/, "");
      const adminSecret = secret || await getStoredSecret();
      const resp = await fetch(`${apiBase}/admin/set-tier`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: adminSecret, identifier: deviceId, tier: newTier }),
      });
      if (resp.ok) {
        setAdminTier(newTier);
        try { await chrome.storage?.local?.set({ adminTier: newTier, adminSecret }); } catch {}
        try {
          const tabId = await getActiveTabId();
          if (tabId) void chrome.tabs.sendMessage(tabId, { type: "SET_ADMIN", secret: adminSecret, tier: newTier });
        } catch {}
      }
    } catch {}
    setAdminLoading(false);
  };

  const handleResetStats = async (): Promise<void> => {
    try {
      const apiBase = settings.apiBaseUrl.replace(/\/$/, "");
      const adminSecret = secret || await getStoredSecret();
      if (!adminSecret) return;
      const resp = await fetch(`${apiBase}/admin/reset-stats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: adminSecret }),
      });
      if (resp.ok) {
        setStats({ freeThisWeek: 0, freeTotal: 0, proThisMonth: 0 });
      }
    } catch {}
  };

  const loadStats = async (): Promise<void> => {
    try {
      const apiBase = settings.apiBaseUrl.replace(/\/$/, "");
      const adminSecret = secret || await getStoredSecret();
      if (!adminSecret) return;
      const resp = await fetch(`${apiBase}/admin/stats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret: adminSecret }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as AdminStats;
        setStats(data);
      }
    } catch {}
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
          <button type="button" class="icon-btn" aria-label={t.header.back} onClick={() => navigate("main")}>←</button>
          {t.settings.title}
        </h1>
      </header>
      <div class="sm-body">
        <div class="sm-settings-row">
          <label>{t.settings.autoCopy}</label>
          <button type="button" class="sm-toggle" data-on={settings.autoCopyOtp} aria-pressed={settings.autoCopyOtp}
            onClick={() => void update({ autoCopyOtp: !settings.autoCopyOtp })} />
        </div>
        <div class="sm-settings-row" style={{ cursor: "pointer" }} onClick={() => navigate("subscription")} role="button" tabIndex={0}>
          <label>{t.settings.subscription}</label>
          <small style={{ color: "var(--sm-text-secondary)" }}>→</small>
        </div>
        <div class="sm-settings-row" style={{ cursor: "pointer" }} onClick={handleVersionTap}>
          <label>{t.settings.version}</label>
          <small>{version}{!isAdmin && tapState.count > 0 ? ` (${tapState.count})` : ""}</small>
        </div>

        {/* 5-tap login */}
        {showSecret && !isAdmin && (
          <div style={{ display: "flex", gap: "6px", padding: "8px 0" }}>
            <input type="password" placeholder="관리자 코드" value={secret}
              onInput={(e) => setSecret((e.target as HTMLInputElement).value)}
              style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid var(--sm-border)", background: "var(--sm-surface)", color: "var(--sm-text)", fontSize: "14px" }} />
            <button type="button" class="sm-btn" style={{ fontSize: "13px", padding: "6px 12px", minWidth: "auto" }}
              disabled={adminLoading || !secret.trim()} onClick={() => void handleSecretSubmit()}>확인</button>
          </div>
        )}

        {/* Admin panel */}
        {isAdmin && (
          <div style={{ background: "#1a1500", borderRadius: "10px", padding: "14px", margin: "10px 0", border: "1px solid #FF950033" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
              <span style={{ color: "#FF9500", fontSize: "13px", fontWeight: "600" }}>관리자 패널</span>
              <button type="button" onClick={() => void handleAdminLogout()}
                style={{ fontSize: "11px", color: "#888", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                로그아웃
              </button>
            </div>

            {/* Tier toggle */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <button type="button" disabled={adminLoading} onClick={() => void handleSetTier("free")}
                style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: "700", cursor: "pointer",
                  background: adminTier === "free" ? "#FF3B30" : "#333", color: "#fff" }}>
                Free (1/일)
              </button>
              <button type="button" disabled={adminLoading} onClick={() => void handleSetTier("pro")}
                style={{ flex: 1, padding: "8px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: "700", cursor: "pointer",
                  background: adminTier === "pro" ? "#00D4AA" : "#333", color: "#fff" }}>
                Pro (20/일)
              </button>
            </div>

            {/* Stats */}
            {stats && (
              <div style={{ borderTop: "1px solid #333", paddingTop: "10px" }}>
                <div style={{ fontSize: "12px", color: "#888", marginBottom: "6px" }}>사용 통계</div>
                <div style={{ display: "flex", gap: "6px" }}>
                  <div style={{ flex: 1, background: "#222", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>{stats.freeThisWeek}</div>
                    <div style={{ fontSize: "10px", color: "#888" }}>이번주 무료</div>
                  </div>
                  <div style={{ flex: 1, background: "#222", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "#fff" }}>{stats.freeTotal}</div>
                    <div style={{ fontSize: "10px", color: "#888" }}>누적 무료</div>
                  </div>
                  <div style={{ flex: 1, background: "#222", borderRadius: "6px", padding: "8px", textAlign: "center" }}>
                    <div style={{ fontSize: "18px", fontWeight: "700", color: "#00D4AA" }}>{stats.proThisMonth}</div>
                    <div style={{ fontSize: "10px", color: "#888" }}>이번달 구독</div>
                  </div>
                </div>
              </div>
            )}

            {/* Reset stats */}
            <button type="button" onClick={() => void handleResetStats()}
              style={{ marginTop: "8px", fontSize: "11px", color: "#FF3B30", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
              통계 초기화
            </button>
          </div>
        )}

        <button type="button" class="sm-btn secondary" onClick={() => void resetOnboarding()}>
          {t.settings.resetOnboarding}
        </button>
      </div>
      <PrivacyFooter />
    </div>
  );
}

async function getStoredSecret(): Promise<string> {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const r = (await chrome.storage.local.get("adminSecret")) as { adminSecret?: string };
      return r.adminSecret ?? "";
    }
  } catch {}
  return "";
}
