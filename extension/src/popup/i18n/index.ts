import { ko, type Messages } from "./ko.js";
import { en } from "./en.js";
import { ja } from "./ja.js";
import { zh } from "./zh.js";
import { fr } from "./fr.js";
import { hi } from "./hi.js";

export type Locale = "ko" | "en" | "ja" | "zh" | "fr" | "hi";

export function resolveLocale(): Locale {
  const lang =
    typeof navigator !== "undefined" ? navigator.language ?? "en" : "en";
  const prefix = lang.toLowerCase().slice(0, 2);
  if (prefix === "ko") return "ko";
  if (prefix === "ja") return "ja";
  if (prefix === "zh") return "zh";
  if (prefix === "fr") return "fr";
  if (prefix === "hi") return "hi";
  return "en"; // default fallback
}

export function getMessages(locale: Locale = resolveLocale()): Messages {
  switch (locale) {
    case "ko": return ko;
    case "ja": return ja;
    case "zh": return zh;
    case "fr": return fr;
    case "hi": return hi;
    default: return en;
  }
}
