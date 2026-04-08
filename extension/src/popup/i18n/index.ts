import { ko, type Messages } from "./ko.js";
import { en } from "./en.js";

export type Locale = "ko" | "en";

export function resolveLocale(): Locale {
  const lang =
    typeof navigator !== "undefined" ? navigator.language ?? "en" : "en";
  return lang.toLowerCase().startsWith("ko") ? "ko" : "en";
}

export function getMessages(locale: Locale = resolveLocale()): Messages {
  return locale === "ko" ? ko : en;
}
