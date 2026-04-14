import { h } from "preact";
import { useState } from "preact/hooks";
import { PrivacyFooter } from "../components/PrivacyFooter.js";
import { getMessages } from "../i18n/index.js";
import { useSettings } from "../state/store.js";
import type { Screen } from "../App.js";

export interface SettingsScreenProps {
  navigate: (s: Screen) => void;
}

const t = getMessages();

export function SettingsScreen({ navigate }: SettingsScreenProps) {
  const [settings, update] = useSettings();

  const version =
    typeof chrome !== "undefined" && chrome.runtime?.getManifest
      ? chrome.runtime.getManifest().version
      : "0.1.0";

  const resetOnboarding = async (): Promise<void> => {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ onboardingCompleted: false });
    }
    navigate("onboarding");
  };

  return (
    <div class="sm-app">
      <header class="sm-header">
        <h1>
          <button
            type="button"
            class="icon-btn"
            aria-label={t.header.back}
            onClick={() => navigate("main")}
          >
            ←
          </button>
          {t.settings.title}
        </h1>
      </header>
      <div class="sm-body">
        <div class="sm-settings-row">
          <label>{t.settings.autoCopy}</label>
          <button
            type="button"
            class="sm-toggle"
            data-on={settings.autoCopyOtp}
            aria-pressed={settings.autoCopyOtp}
            onClick={() => void update({ autoCopyOtp: !settings.autoCopyOtp })}
          />
        </div>
        {/* MVP: Managed Mode, API Base URL, GitHub link hidden — deferred to post-launch */}
        <div class="sm-settings-row">
          <label>{t.settings.version}</label>
          <small>{version}</small>
        </div>
        <button type="button" class="sm-btn secondary" onClick={() => void resetOnboarding()}>
          {t.settings.resetOnboarding}
        </button>
      </div>
      <PrivacyFooter />
    </div>
  );
}
