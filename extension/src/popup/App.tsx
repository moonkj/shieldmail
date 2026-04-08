import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import { OnboardingScreen } from "./screens/OnboardingScreen.js";
import { MainScreen } from "./screens/MainScreen.js";
import { ManagedScreen } from "./screens/ManagedScreen.js";
import { SettingsScreen } from "./screens/SettingsScreen.js";

export type Screen = "onboarding" | "main" | "managed" | "settings";

export function App() {
  // Default to "main" so the popup is never blank while storage resolves.
  // useEffect below will redirect to "onboarding" if needed.
  const [screen, setScreen] = useState<Screen>("main");

  useEffect(() => {
    let mounted = true;
    const init = async (): Promise<void> => {
      if (typeof chrome === "undefined" || !chrome.storage?.local) return;
      try {
        // 1.5s timeout: if storage hangs (iOS sandbox), stay on "main".
        const res = await Promise.race([
          chrome.storage.local.get("onboardingCompleted") as Promise<{
            onboardingCompleted?: boolean;
          }>,
          new Promise<{ onboardingCompleted?: boolean }>((resolve) =>
            setTimeout(() => resolve({}), 1500),
          ),
        ]);
        if (!mounted) return;
        if (!res.onboardingCompleted) setScreen("onboarding");
      } catch {
        // Storage unavailable — stay on "main".
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, []);

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
