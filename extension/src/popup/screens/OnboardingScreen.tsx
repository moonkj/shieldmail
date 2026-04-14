import { h, Fragment } from "preact";
import { useState } from "preact/hooks";
import { ShieldLogo } from "../components/ShieldLogo.js";
import { getMessages } from "../i18n/index.js";
import { useSettings } from "../state/store.js";
import type { Screen } from "../App.js";

export interface OnboardingScreenProps {
  navigate: (s: Screen) => void;
}

const t = getMessages();

export function OnboardingScreen({ navigate }: OnboardingScreenProps) {
  const [step, setStep] = useState<1 | 3>(1);
  const [, updateSettings] = useSettings();

  const finish = async (): Promise<void> => {
    // onboardingCompleted is not part of frozen UserSettings; we persist it as a side flag.
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ onboardingCompleted: true });
    }
    navigate("main");
  };

  return (
    <div class="sm-app">
      <div class="sm-onboard">
        {step === 1 && (
          <Fragment>
            <ShieldLogo size={64} />
            <h2>{t.onboarding.step1Title}</h2>
            <p>{t.onboarding.step1Tagline}</p>
            <p>{t.onboarding.step1Body}</p>
            <button type="button" class="sm-btn" onClick={() => setStep(3)}>
              {t.onboarding.step1Cta}
            </button>
          </Fragment>
        )}
        {step === 3 && (
          <Fragment>
            <h2>{t.onboarding.step3Title}</h2>
            <p>{t.onboarding.step3Body}</p>
            <button
              type="button"
              class="sm-btn secondary"
              onClick={() => {
                if (typeof chrome !== "undefined" && chrome.tabs?.create) {
                  void chrome.tabs.create({
                    url: "https://support.apple.com/guide/safari/customize-extensions-ibrw1014/mac",
                  });
                }
              }}
            >
              {t.onboarding.openSafariSettings}
            </button>
            <button type="button" class="sm-btn" onClick={() => void finish()}>
              {t.onboarding.finish}
            </button>
          </Fragment>
        )}
      </div>
    </div>
  );
}
