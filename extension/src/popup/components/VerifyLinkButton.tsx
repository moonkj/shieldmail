import { h } from "preact";
import { getMessages } from "../i18n/index.js";

export interface VerifyLinkButtonProps {
  url: string;
  messageId?: string;
  onConsumed?: (messageId: string) => void;
}

const t = getMessages();

export function VerifyLinkButton({ url, messageId, onConsumed }: VerifyLinkButtonProps) {
  let origin = url;
  try {
    origin = new URL(url).origin;
  } catch {
    // keep raw
  }
  const handleClick = (): void => {
    if (typeof chrome !== "undefined" && chrome.tabs?.create) {
      void chrome.tabs.create({ url });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    if (messageId) onConsumed?.(messageId);
  };
  return (
    <div class="sm-verify">
      <button type="button" class="sm-btn" onClick={handleClick}>
        <span aria-hidden="true">⚠</span>
        {t.main.openVerify}
        <small>{origin}</small>
      </button>
      <p class="sm-verify-warning">{t.main.verifyWarning}</p>
    </div>
  );
}
