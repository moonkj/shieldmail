import { h, Fragment } from "preact";
import { useState } from "preact/hooks";
import { ShieldLogo } from "../components/ShieldLogo.js";
import { ModePill } from "../components/ModePill.js";
import { getMessages } from "../i18n/index.js";
import { useSettings } from "../state/store.js";
import type { UserMode } from "../../lib/types.js";
import type { Screen } from "../App.js";

export interface OnboardingScreenProps {
  navigate: (s: Screen) => void;
}

const t = getMessages();

export function OnboardingScreen({ navigate }: OnboardingScreenProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [, updateSettings] = useSettings();
  const [mode, setMode] = useState<UserMode>("developer");

  const chooseMode = async (m: UserMode): Promise<void> => {
    setMode(m);
    if (m === "developer") {
      await updateSettings({ userMode: "developer", autoCopyOtp: true, managedModeEnabled: false });
    } else {
      await updateSettings({ userMode: "everyday", autoCopyOtp: false, managedModeEnabled: true });
    }
  };

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
            <button type="button" class="sm-btn" onClick={() => setStep(2)}>
              {t.onboarding.step1Cta}
            </button>
          </Fragment>
        )}
        {step === 2 && (
          <Fragment>
            <h2>{t.onboarding.step2Title}</h2>
            <div class="sm-mode-pills" style={{ width: "100%" }}>
              <ModePill
                mode="developer"
                selected={mode === "developer"}
                label={t.settings.developer}
                description={t.onboarding.modeDev}
                onSelect={(m) => void chooseMode(m)}
              />
              <ModePill
                mode="everyday"
                selected={mode === "everyday"}
                label={t.settings.everyday}
                description={t.onboarding.modeEveryday}
                onSelect={(m) => void chooseMode(m)}
              />
            </div>
            <button type="button" class="sm-btn" onClick={() => setStep(3)}>
              {t.onboarding.next}
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
