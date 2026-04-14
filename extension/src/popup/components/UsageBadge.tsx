import { h } from "preact";
import { getMessages } from "../i18n/index.js";
import type { SubscriptionTier } from "../../lib/types.js";

export interface UsageBadgeProps {
  used: number;
  limit: number;
  tier: SubscriptionTier;
}

const t = getMessages();

export function UsageBadge({ used, limit, tier }: UsageBadgeProps) {
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 0;
  const isOverLimit = tier === "free" && used >= limit;
  const isPro = tier === "pro";

  const barColor = isPro
    ? "var(--sm-success)"
    : isOverLimit
      ? "var(--sm-danger)"
      : "var(--sm-primary)";

  return (
    <div class="sm-usage-badge" role="status">
      <div class="sm-usage-info">
        <span class="sm-usage-text">
          {t.usage.used(used, limit)}
        </span>
        {isPro && (
          <span class="sm-usage-tier sm-usage-tier--pro">Pro</span>
        )}
      </div>
      <div class="sm-usage-bar">
        <div
          class="sm-usage-bar-fill"
          style={{
            width: `${ratio * 100}%`,
            background: barColor,
          }}
        />
      </div>
    </div>
  );
}
