/**
 * Component tests for ManagedScreen — alias list, search, tag filter, detail dialog.
 */
import { describe, it, expect, vi } from "vitest";
import { ManagedScreen } from "../../src/popup/screens/ManagedScreen";
import { renderComponent, flush } from "./_render";
import { getMessages } from "../../src/popup/i18n/index";

const t = getMessages();

describe("ManagedScreen", () => {
  it("renders the title", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(ManagedScreen, { navigate });
    expect(container.textContent).toContain(t.managed.title);
  });

  it("shows search input", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(ManagedScreen, { navigate });
    const searchInput = container.querySelector("input[type='search']");
    expect(searchInput).not.toBeNull();
  });

  it("shows tag chips", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(ManagedScreen, { navigate });
    expect(container.textContent).toContain(t.managed.tags.all);
    expect(container.textContent).toContain(t.managed.tags.work);
    expect(container.textContent).toContain(t.managed.tags.shopping);
    expect(container.textContent).toContain(t.managed.tags.qa);
  });

  it("shows empty state when no aliases", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(ManagedScreen, { navigate });
    expect(container.textContent).toContain(t.managed.empty);
  });

  it("back button navigates to main", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(ManagedScreen, { navigate });
    const backBtn = container.querySelector("[aria-label]") as HTMLButtonElement;
    backBtn.click();
    expect(navigate).toHaveBeenCalledWith("main");
  });

  it("renders the privacy footer", () => {
    const navigate = vi.fn();
    const { container } = renderComponent(ManagedScreen, { navigate });
    expect(container.textContent).toContain(t.privacy.footer);
  });
});
