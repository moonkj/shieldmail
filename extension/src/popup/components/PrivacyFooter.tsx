import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { getMessages } from "../i18n/index.js";

export interface PrivacyFooterProps {
  expiresAt?: number | null;
}

const t = getMessages();

function formatMmSs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function PrivacyFooter({ expiresAt }: PrivacyFooterProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= expiresAt) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  return (
    <footer class="sm-privacy-footer" role="contentinfo">
      {t.privacy.footer}
      {expiresAt ? (
        <span class="ttl">{t.main.ttlRemaining(formatMmSs(expiresAt - now))}</span>
      ) : null}
    </footer>
  );
}
