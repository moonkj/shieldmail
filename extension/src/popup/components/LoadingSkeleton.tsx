import { h } from "preact";
import { getMessages } from "../i18n/index.js";

const t = getMessages();

export function LoadingSkeleton() {
  return (
    <div class="sm-skeleton" role="status" aria-live="polite">
      <div class="sm-skeleton-bars">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} class="sm-skeleton-bar" />
        ))}
      </div>
      <div class="sm-progress">
        <div class="sm-progress-bar" />
      </div>
      <small style={{ color: "var(--sm-text-muted)" }}>{t.main.waiting}</small>
    </div>
  );
}
