import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { PrivacyFooter } from "../components/PrivacyFooter.js";
import { getMessages } from "../i18n/index.js";
import {
  getSubscriptionState,
  refreshSubscriptionState,
  requestPurchase,
} from "../../lib/subscription.js";
import type { Screen } from "../App.js";
import type { SubscriptionTier } from "../../lib/types.js";

export interface SubscriptionScreenProps {
  navigate: (s: Screen) => void;
}

const t = getMessages();

export function SubscriptionScreen({ navigate }: SubscriptionScreenProps) {
  const [tier, setTier] = useState<SubscriptionTier>("free");
  const [loading, setLoading] = useState(true);

  // Load subscription state on mount — try cached tier first, then native messaging.
  useEffect(() => {
    let mounted = true;
    void (async () => {
      // 1. chrome.storage cached tier (fast).
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          const r = await Promise.race([
            chrome.storage.local.get("cachedTier") as Promise<Record<string, unknown>>,
            new Promise<Record<string, unknown>>((r) => setTimeout(() => r({}), 1000)),
          ]);
          if (mounted && r.cachedTier === "pro") {
            setTier("pro");
            setLoading(false);
            return;
          }
        }
      } catch {}
      // 2. Native messaging fallback.
      const state = await getSubscriptionState();
      if (mounted) {
        setTier(state.tier);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleSubscribe = (): void => {
    void requestPurchase();
  };

  const handleRestore = (): void => {
    setLoading(true);
    void refreshSubscriptionState().then((state) => {
      setTier(state.tier);
      setLoading(false);
    });
  };

  const handleManage = (): void => {
    // Apple subscription management deep link
    window.open("https://apps.apple.com/account/subscriptions", "_blank", "noopener");
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
          {t.subscription.title}
        </h1>
      </header>
      <div class="sm-body">
        {/* Current plan */}
        <div class="sm-card">
          <div class="sm-section-label">{t.subscription.currentPlan}</div>
          <div class="sm-subscription-plan">
            {loading ? "..." : tier === "pro" ? "Pro" : t.subscription.freePlan}
          </div>
        </div>

        {/* Pro benefits */}
        <div class="sm-card">
          <div class="sm-section-label">{t.subscription.benefitsTitle}</div>
          <ul class="sm-benefits-list">
            <li>{t.subscription.benefit1}</li>
            <li>{t.subscription.benefit2}</li>
            <li>{t.subscription.benefit3}</li>
          </ul>
        </div>

        {/* Subscribe CTA */}
        {tier === "free" && (
          <button type="button" class="sm-btn" onClick={handleSubscribe}>
            {t.subscription.subscribe}
          </button>
        )}

        {/* Restore purchases */}
        <button type="button" class="sm-btn ghost" onClick={handleRestore}>
          {t.subscription.restore}
        </button>

        {/* Apple subscription management */}
        <button type="button" class="sm-btn secondary" onClick={handleManage}>
          {t.subscription.manage}
        </button>

        {/* Subscription terms (Apple required) */}
        <p style={{ fontSize: "11px", color: "var(--sm-text-tertiary)", textAlign: "center", marginTop: "12px", lineHeight: "1.4" }}>
          {t.subscription.disclaimer}
        </p>

        {/* Legal links (Apple required) */}
        <div style={{ display: "flex", justifyContent: "center", gap: "16px", marginTop: "8px" }}>
          <a
            href="https://moonkj.github.io/shieldmail/privacy.html"
            target="_blank"
            rel="noopener"
            style={{ fontSize: "11px", color: "var(--sm-text-secondary)" }}
          >
            {t.subscription.privacyPolicy}
          </a>
          <a
            href="https://moonkj.github.io/shieldmail/terms.html"
            target="_blank"
            rel="noopener"
            style={{ fontSize: "11px", color: "var(--sm-text-secondary)" }}
          >
            {t.subscription.termsOfUse}
          </a>
        </div>
      </div>
      <PrivacyFooter />
    </div>
  );
}
