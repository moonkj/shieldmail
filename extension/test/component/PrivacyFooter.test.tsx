/**
 * Component tests for PrivacyFooter — always-visible privacy string.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { PrivacyFooter } from "../../src/popup/components/PrivacyFooter";
import { renderComponent } from "./_render";
import { getMessages } from "../../src/popup/i18n/index";

const t = getMessages();

afterEach(() => {
  vi.useRealTimers();
});

describe("PrivacyFooter", () => {
  it("always renders the privacy footer string", () => {
    const { container } = renderComponent(PrivacyFooter, {});
    expect(container.textContent).toContain(t.privacy.footer);
  });

  it("renders as a footer element with contentinfo role", () => {
    const { container } = renderComponent(PrivacyFooter, {});
    const footer = container.querySelector("footer");
    expect(footer).not.toBeNull();
    expect(footer?.getAttribute("role")).toBe("contentinfo");
  });
});
