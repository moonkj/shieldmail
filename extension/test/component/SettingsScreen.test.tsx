/**
 * Component tests for SettingsScreen — settings UI and navigation.
 */
import { describe, it, expect, vi } from "vitest";
import { SettingsScreen } from "../../src/popup/screens/SettingsScreen";
import { renderComponent, flush } from "./_render";
import { getMessages } from "../../src/popup/i18n/index";

const t = getMessages();

describe("SettingsScreen", () => {
  it("renders the settings title", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(SettingsScreen, { navigate });
    expect(container.textContent).toContain(t.settings.title);
  });

  it("does not show user mode toggle (removed for release)", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(SettingsScreen, { navigate });
    expect(container.textContent).not.toContain(t.settings.developer);
    expect(container.textContent).not.toContain(t.settings.everyday);
  });

  it("shows auto-copy toggle", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(SettingsScreen, { navigate });
    expect(container.textContent).toContain(t.settings.autoCopy);
  });

  it("shows version info", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(SettingsScreen, { navigate });
    expect(container.textContent).toContain(t.settings.version);
  });

  it("shows reset onboarding button", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(SettingsScreen, { navigate });
    expect(container.textContent).toContain(t.settings.resetOnboarding);
  });

  it("back button navigates to main", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(SettingsScreen, { navigate });
    const backBtn = container.querySelector("[aria-label]") as HTMLButtonElement;
    backBtn.click();
    expect(navigate).toHaveBeenCalledWith("main");
  });

  it("reset onboarding button navigates to onboarding", async () => {
    const navigate = vi.fn();
    const { container } = renderComponent(SettingsScreen, { navigate });
    const buttons = container.querySelectorAll("button");
    const resetBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes(t.settings.resetOnboarding),
    );
    resetBtn?.click();
    await flush();
    await flush();
    expect(navigate).toHaveBeenCalledWith("onboarding");
  });

  it("renders the privacy footer", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(SettingsScreen, { navigate });
    expect(container.textContent).toContain(t.privacy.footer);
  });
});
