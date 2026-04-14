/**
 * Component tests for MainScreen — main popup view.
 */
import { describe, it, expect, vi } from "vitest";
import { MainScreen } from "../../src/popup/screens/MainScreen";
import { renderComponent, flush } from "./_render";
import { getMessages } from "../../src/popup/i18n/index";

const t = getMessages();

describe("MainScreen", () => {
  it("renders the app title", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    expect(container.textContent).toContain(t.appTitle);
  });

  it("renders settings button", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    const settingsBtn = container.querySelector(
      `[aria-label="${t.header.settings}"]`,
    );
    expect(settingsBtn).not.toBeNull();
  });

  it("settings button navigates to settings screen", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    const settingsBtn = container.querySelector(
      `[aria-label="${t.header.settings}"]`,
    ) as HTMLButtonElement;
    settingsBtn.click();
    expect(navigate).toHaveBeenCalledWith("settings");
  });

  it("shows empty state message when no alias", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    expect(container.textContent).toContain(t.main.emptyState);
  });

  it("shows generate button in empty state", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    const genBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes(t.main.generateNew),
    );
    expect(genBtn).not.toBeUndefined();
  });

  it("renders the privacy footer", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    expect(container.textContent).toContain(t.privacy.footer);
  });

  it("has ShieldLogo in header", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(MainScreen, { navigate });
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
