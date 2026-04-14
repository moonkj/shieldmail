/**
 * Component tests for VerifyLinkButton — verify link rendering and click.
 */
import { describe, it, expect, vi } from "vitest";
import { VerifyLinkButton } from "../../src/popup/components/VerifyLinkButton";
import { renderComponent } from "./_render";
import { getMessages } from "../../src/popup/i18n/index";

const t = getMessages();

describe("VerifyLinkButton", () => {
  it("renders the openVerify text", () => {
    const { container } = renderComponent(VerifyLinkButton, {
      url: "https://example.com/verify/abc",
    });
    expect(container.textContent).toContain(t.main.openVerify);
  });

  it("renders the origin from the URL", () => {
    const { container } = renderComponent(VerifyLinkButton, {
      url: "https://example.com/verify/abc",
    });
    expect(container.textContent).toContain("https://example.com");
  });

  it("renders the warning text", () => {
    const { container } = renderComponent(VerifyLinkButton, {
      url: "https://example.com/verify",
    });
    expect(container.textContent).toContain(t.main.verifyWarning);
  });

  it("opens tab via chrome.tabs.create on click", () => {
    const { container } = renderComponent(VerifyLinkButton, {
      url: "https://example.com/verify/abc",
    });
    const btn = container.querySelector("button") as HTMLButtonElement;
    btn.click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "https://example.com/verify/abc",
    });
  });

  it("calls onConsumed with messageId on click", () => {
    const onConsumed = vi.fn();
    const { container } = renderComponent(VerifyLinkButton, {
      url: "https://example.com/verify",
      messageId: "m1",
      onConsumed,
    });
    const btn = container.querySelector("button") as HTMLButtonElement;
    btn.click();
    expect(onConsumed).toHaveBeenCalledWith("m1");
  });

  it("does not call onConsumed when messageId is absent", () => {
    const onConsumed = vi.fn();
    const { container } = renderComponent(VerifyLinkButton, {
      url: "https://example.com/verify",
      onConsumed,
    });
    const btn = container.querySelector("button") as HTMLButtonElement;
    btn.click();
    expect(onConsumed).not.toHaveBeenCalled();
  });

  it("handles malformed URL gracefully (shows raw)", () => {
    const { container } = renderComponent(VerifyLinkButton, {
      url: "not-a-url",
    });
    expect(container.textContent).toContain("not-a-url");
  });
});
