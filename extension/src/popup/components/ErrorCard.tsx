import { h } from "preact";
import { getMessages } from "../i18n/index.js";
import type { ErrorCode } from "../../lib/messaging.js";

export interface ErrorCardProps {
  code: ErrorCode;
  onRetry?: () => void;
  onNewAlias?: () => void;
  onFallback?: () => void;
}

const t = getMessages();

export function ErrorCard({ code, onRetry, onNewAlias, onFallback }: ErrorCardProps) {
  const message = t.errors[code] ?? t.errors.unknown;

  let action: h.JSX.Element | null = null;
  switch (code) {
    case "rate_limited":
    case "network_unavailable":
      action = onRetry ? (
        <button class="sm-btn" type="button" onClick={onRetry}>
          {t.errors.retry}
        </button>
      ) : null;
      break;
    case "token_revoked":
    case "alias_expired":
      action = onNewAlias ? (
        <button class="sm-btn" type="button" onClick={onNewAlias}>
          {t.errors.newAlias}
        </button>
      ) : null;
      break;
    case "domain_blocked":
      action = onFallback ? (
        <button class="sm-btn secondary" type="button" onClick={onFallback}>
          {t.errors.fallback}
        </button>
      ) : null;
      break;
    default:
      action = null;
  }

  return (
    <div class="sm-error-card" role="alert">
      <h3>⚠</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}
