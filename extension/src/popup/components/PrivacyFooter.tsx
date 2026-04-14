import { h } from "preact";
import { getMessages } from "../i18n/index.js";

const t = getMessages();

export function PrivacyFooter() {
  return (
    <footer class="sm-privacy-footer" role="contentinfo">
      {t.privacy.footer}
    </footer>
  );
}
