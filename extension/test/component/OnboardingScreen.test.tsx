/**
 * Component tests for OnboardingScreen — step navigation and mode selection.
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

  it("advances to step 2 when CTA is clicked", async () => {
    const navigate = vi.fn();
    const { container } = renderComponent(OnboardingScreen, { navigate });
    const btn = container.querySelector("button") as HTMLButtonElement;
    btn.click();
    await flush();
    expect(container.textContent).toContain(t.onboarding.step2Title);
  });

  it("step 2 shows mode pills", async () => {
    const navigate = vi.fn();
    const { container } = renderComponent(OnboardingScreen, { navigate });
    // Click to step 2
    (container.querySelector("button") as HTMLButtonElement).click();
    await flush();
    expect(container.textContent).toContain(t.settings.developer);
    expect(container.textContent).toContain(t.settings.everyday);
  });

  it("advances to step 3 and shows finish button", async () => {
    const navigate = vi.fn();
    const { container } = renderComponent(OnboardingScreen, { navigate });
    // Step 1 → Step 2
    (container.querySelector("button") as HTMLButtonElement).click();
    await flush();
    // Step 2 → Step 3: click the "Next" button
    const buttons = container.querySelectorAll("button");
    const nextBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes(t.onboarding.next),
    );
    nextBtn?.click();
    await flush();
    expect(container.textContent).toContain(t.onboarding.step3Title);
    expect(container.textContent).toContain(t.onboarding.finish);
  });

  it("finish navigates to main screen", async () => {
    const navigate = vi.fn();
    const { container } = renderComponent(OnboardingScreen, { navigate });
    // Step 1 → 2 → 3
    (container.querySelector("button") as HTMLButtonElement).click();
    await flush();
    const buttons2 = container.querySelectorAll("button");
    Array.from(buttons2)
      .find((b) => b.textContent?.includes(t.onboarding.next))
      ?.click();
    await flush();
    // Click finish
    const buttons3 = container.querySelectorAll("button");
    const finishBtn = Array.from(buttons3).find((b) =>
      b.textContent?.includes(t.onboarding.finish),
    );
    finishBtn?.click();
    await flush();
    await flush();
    expect(navigate).toHaveBeenCalledWith("main");
  });
});
