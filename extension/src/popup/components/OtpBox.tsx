import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { getMessages } from "../i18n/index.js";

export interface OtpBoxProps {
  otp?: string;
  confidence?: number;
  autoCopy: boolean;
  messageId?: string;
  onConsumed?: (messageId: string) => void;
}

const t = getMessages();

export function OtpBox({ otp, confidence, autoCopy, messageId, onConsumed }: OtpBoxProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!otp || !autoCopy) return;
    let cancelled = false;
    void navigator.clipboard
      ?.writeText(otp)
      .then(() => {
        if (!cancelled) {
          setCopied(true);
          if (messageId) onConsumed?.(messageId);
          setTimeout(() => {
            if (!cancelled) setCopied(false);
          }, 1500);
        }
      })
      .catch(() => {
        /* ignore — user can press copy fallback */
      });
    return () => {
      cancelled = true;
    };
  }, [otp, autoCopy, messageId]);

  const handleCopy = (): void => {
    if (!otp) return;
    void navigator.clipboard?.writeText(otp).then(() => {
      setCopied(true);
      if (messageId) onConsumed?.(messageId);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const low = typeof confidence === "number" && confidence < 0.5;

  return (
    <div
      class="sm-otp-box"
      role="group"
      aria-label="일회용 인증번호"
      aria-live="polite"
    >
      <div class="sm-otp-digits">{otp ?? "------"}</div>
      <div class="sm-otp-toast">
        {copied ? t.main.copied : low ? t.main.lowConfidence : ""}
      </div>
      <button class="sm-copy-btn" type="button" onClick={handleCopy} disabled={!otp}>
        {copied ? "✓" : t.main.copy}
      </button>
    </div>
  );
}
