import { h } from "preact";
import { getMessages } from "../i18n/index.js";
import type { Screen } from "../App.js";

export interface LimitSheetProps {
  navigate: (s: Screen) => void;
  onDismiss: () => void;
}

const t = getMessages();

export function LimitSheet({ navigate, onDismiss }: LimitSheetProps) {
  return (
    <div class="sm-limit-overlay" onClick={onDismiss}>
      <div
        class="sm-limit-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t.limit.title}
        onClick={(e) => e.stopPropagation()}
      >
        <div class="sm-limit-icon">&#9888;</div>
        <h3 class="sm-limit-title">{t.limit.title}</h3>
        <p class="sm-limit-body">{t.limit.body}</p>
        <button
          type="button"
          class="sm-btn"
          onClick={() => navigate("subscription")}
        >
          {t.limit.upgrade}
        </button>
        <button
          type="button"
          class="sm-btn ghost"
          onClick={onDismiss}
        >
          {t.limit.dismiss}
        </button>
      </div>
    </div>
  );
}
