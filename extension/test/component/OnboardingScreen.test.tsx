/**
 * Component tests for OnboardingScreen — step navigation (step 2 mode selection removed).
 */
import { describe, it, expect, vi } from "vitest";
import { OnboardingScreen } from "../../src/popup/screens/OnboardingScreen";
import { renderComponent, flush } from "./_render";
import { getMessages } from "../../src/popup/i18n/index";

const t = getMessages();

describe("OnboardingScreen", () => {
  it("renders step 1 initially", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(OnboardingScreen, { navigate });
    expect(container.textContent).toContain(t.onboarding.step1Title);
    expect(container.textContent).toContain(t.onboarding.step1Tagline);
    expect(container.textContent).toContain(t.onboarding.step1Cta);
  });

  it("shows ShieldLogo on step 1", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(OnboardingScreen, { navigate });
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("advances to step 3 when CTA is clicked (step 2 removed)", async () => {
    const navigate = vi.fn();
    const { container } = renderComponent(OnboardingScreen, { navigate });
    const btn = container.querySelector("button") as HTMLButtonElement;
    btn.click();
    await flush();
    expect(container.textContent).toContain(t.onboarding.step3Title);
  });

  it("step 3 shows finish button", async () => {
    const navigate = vi.fn();
    const { container } = renderComponent(OnboardingScreen, { navigate });
    (container.querySelector("button") as HTMLButtonElement).click();
    await flush();
    expect(container.textContent).toContain(t.onboarding.finish);
  });

  it("finish navigates to main screen", async () => {
    const navigate = vi.fn();
    const { container } = renderComponent(OnboardingScreen, { navigate });
    // Step 1 → 3
    (container.querySelector("button") as HTMLButtonElement).click();
    await flush();
    // Click finish
    const buttons = container.querySelectorAll("button");
    const finishBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes(t.onboarding.finish),
    );
    finishBtn?.click();
    await flush();
    await flush();
    expect(navigate).toHaveBeenCalledWith("main");
  });
});
