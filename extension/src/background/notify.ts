// chrome.notifications helper. Only fires when popup likely is NOT open.
// Popup detection: send a PING via sendRuntime and require a strict
// PONG response within 300ms. The popup (Coder C R2) registers the
// responder. Additionally skip if GENERATE_ALIAS was seen <5s ago
// (user is actively interacting, popup has focus).

import { sendRuntime, type PongMessage } from "../lib/messaging.js";

let lastGenerateAliasAt = 0;
export function markGenerateAliasSeen(): void {
  lastGenerateAliasAt = Date.now();
}

async function popupLikelyOpen(): Promise<boolean> {
  if (Date.now() - lastGenerateAliasAt < 5_000) return true;
  const pongPromise = sendRuntime<PongMessage>({
    type: "__SHIELDMAIL_PING__",
  }).then((res) =>
    typeof res === "object" &&
    res !== null &&
    (res as { type?: unknown }).type === "__SHIELDMAIL_PONG__",
  );
  const timeoutPromise = new Promise<boolean>((resolve) =>
    setTimeout(() => resolve(false), 300),
  );
  try {
    return await Promise.race<boolean>([pongPromise, timeoutPromise]);
  } catch {
    return false;
  }
}

export async function notifyOtpArrived(
  aliasAddress: string,
  _otp: string | undefined,
): Promise<void> {
  if (await popupLikelyOpen()) return;
  // PRIVACY: never place the OTP in the OS notification body. macOS / iOS
  // notification centers persist history indefinitely (including on the lock
  // screen) which violates UX_SPEC §6 "OTP는 메모리에 임시 보관 후 자동 삭제".
  // Only the alias is surfaced; the full OTP is revealed in the popup only.
  try {
    await chrome.notifications.create(`shieldmail-${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon-48.png",
      title: "인증 코드 도착",
      message: `${aliasAddress}\n클릭하여 확인`,
      priority: 2,
    });
  } catch {
    // notifications permission missing — ignore silently.
  }
}

export function registerNotificationClickHandler(): void {
  chrome.notifications.onClicked.addListener((notificationId) => {
    void chrome.notifications.clear(notificationId);
    // Try to focus last window / open popup. chrome.action.openPopup is not
    // universally supported; fallback to focusing last window.
    const action = (chrome as unknown as {
      action?: { openPopup?: () => Promise<void> };
    }).action;
    if (action?.openPopup) {
      action.openPopup().catch(() => {
        void chrome.windows
          .getLastFocused()
          .then((w) => {
            if (w.id !== undefined) {
              void chrome.windows.update(w.id, { focused: true });
            }
          });
      });
    }
  });
}
