import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { OnboardingScreen } from "./screens/OnboardingScreen.js";
import { MainScreen } from "./screens/MainScreen.js";
import { ManagedScreen } from "./screens/ManagedScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";

export type Screen = "onboarding" | "main" | "managed" | "settings";

export function App() {
  const [screen, setScreen] = useState<Screen | null>(null);

  useEffect(() => {
    let mounted = true;
    const init = async (): Promise<void> => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) {
        if (mounted) setScreen("main");
        return;
      }
      const res = (await chrome.storage.local.get("onboardingCompleted")) as {
        onboardingCompleted?: boolean;
      };
      if (!mounted) return;
      setScreen(res.onboardingCompleted ? "main" : "onboarding");
    };
    void init();
    return () => {
      mounted = false;
    };
  }, []);

  if (screen === null) return null;

  switch (screen) {
    case "onboarding":
      return <OnboardingScreen navigate={setScreen} />;
    case "main":
      return <MainScreen navigate={setScreen} />;
    case "managed":
      return <ManagedScreen navigate={setScreen} />;
    case "settings":
      return <SettingsScreen navigate={setScreen} />;
  }
}
