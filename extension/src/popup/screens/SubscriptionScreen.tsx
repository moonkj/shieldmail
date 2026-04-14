import { h } from "preact";
import { PrivacyFooter } from "../components/PrivacyFooter.js";
import { getMessages } from "../i18n/index.js";
import type { Screen } from "../App.js";
import type { SubscriptionTier } from "../../lib/types.js";

export interface SubscriptionScreenProps {
  navigate: (s: Screen) => void;
}

const t = getMessages();

export function SubscriptionScreen({ navigate }: SubscriptionScreenProps) {
  // TODO: read actual tier from storage / StoreKit (Wave 3)
  const tier = "free" as SubscriptionTier;

  const handleSubscribe = (): void => {
    // Placeholder — StoreKit integration in Wave 3
  };

  const handleRestore = (): void => {
    // Placeholder — StoreKit restore purchases in Wave 3
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
            {tier === "pro" ? "Pro" : t.subscription.freePlan}
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

        {/* Disclaimer */}
        <p style={{ fontSize: "11px", color: "var(--sm-text-tertiary)", textAlign: "center", marginTop: "12px" }}>
          {t.subscription.disclaimer}
        </p>
      </div>
      <PrivacyFooter />
    </div>
  );
}
