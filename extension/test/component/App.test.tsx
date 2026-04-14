/**
 * Component tests for App — screen routing.
 */
import { describe, it, expect, vi } from "vitest";
import { App } from "../../src/popup/App";
import { renderComponent, flush } from "./_render";
import { getMessages } from "../../src/popup/i18n/index";

const t = getMessages();

describe("App", () => {
  it("renders without crashing", () => {
    const { container } = renderComponent(App, {});
    expect(container.innerHTML).not.toBe("");
  });

  it("starts on main screen by default", () => {
    const { container } = renderComponent(App, {});
    // Main screen shows the app title
    expect(container.textContent).toContain(t.appTitle);
  });

  it("shows onboarding if onboardingCompleted is false", async () => {
    // Set up storage to return onboardingCompleted = false
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      onboardingCompleted: false,
    });

    const { container } = renderComponent(App, {});
    await flush();
    await flush();
    await flush();

    // Onboarding screen shows step 1 title
    expect(container.textContent).toContain(t.onboarding.step1Title);
  });

  it("stays on main if storage lookup times out", async () => {
    // Simulate a very slow storage call
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}), // never resolves
    );

    const { container } = renderComponent(App, {});
    await flush();

    // Should remain on main (with app title)
    expect(container.textContent).toContain(t.appTitle);
  });
});
