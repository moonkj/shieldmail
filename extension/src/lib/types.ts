// Shared type definitions used across content / background / popup.

export type AliasMode = "ephemeral" | "managed";

export interface AliasRecord {
  aliasId: string;
  address: string;
  expiresAt: number | null;
  pollToken: string;
  mode: AliasMode;
  /** site origin where alias was used; populated by content script before storing */
  origin?: string;
  /** human label, optional */
  label?: string;
  createdAt: number;
  /** Managed Mode tags (쇼핑/업무/QA/뉴스레터 etc.). Preset or free-form. */
  tags?: string[];
}

/**
 * Extension-level flags stored at top-level storage keys (NOT inside UserSettings).
 * Kept separate so that `UserSettings` stays a user-facing preferences bag.
 */
export interface ExtensionFlags {
  onboardingCompleted?: boolean;
}

export interface ExtractedMessage {
  id: string;
  otp?: string;
  confidence?: number;
  verifyLinks?: string[];
  receivedAt: number;
}

/* ---------- Runtime messages between content ↔ background ↔ popup ---------- */

export type RuntimeMessage =
  | { type: "DETECT_RESULT"; score: number; activated: boolean; tabId?: number }
  | { type: "GENERATE_ALIAS"; mode: AliasMode; origin: string; label?: string }
  | { type: "GENERATE_ALIAS_RESULT"; ok: true; record: AliasRecord }
  | { type: "GENERATE_ALIAS_RESULT"; ok: false; error: string }
  | { type: "STORE_ALIAS"; record: AliasRecord }
  | { type: "FETCH_MESSAGES"; aliasId: string }
  | { type: "FETCH_MESSAGES_RESULT"; ok: true; messages: ExtractedMessage[]; expired: boolean }
  | { type: "FETCH_MESSAGES_RESULT"; ok: false; error: string }
  | { type: "ACK_MESSAGE"; aliasId: string; messageId: string }
  | { type: "DELETE_ALIAS"; aliasId: string }
  | { type: "FILL_FIELD"; address: string }
  | { type: "OPEN_VERIFY_LINK"; url: string };

export type UserMode = "developer" | "everyday";

export interface UserSettings {
  userMode: UserMode;
  autoCopyOtp: boolean;
  managedModeEnabled: boolean;
  apiBaseUrl: string;
  /** activation threshold for Shield Mode icon (default 0.70 per ARCHITECTURE D2) */
  detectionThreshold: number;
}

export const DEFAULT_SETTINGS: UserSettings = {
  userMode: "developer",
  autoCopyOtp: true,
  managedModeEnabled: false,
  apiBaseUrl: "https://api.shldmail.work",
  detectionThreshold: 0.7,
};
