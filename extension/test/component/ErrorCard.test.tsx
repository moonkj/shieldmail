/**
 * Component tests for ErrorCard — 5 error codes × action wiring.
 */
import { describe, it, expect, vi } from "vitest";
import { ErrorCard } from "../../src/popup/components/ErrorCard";
import { renderComponent } from "./_render";
import { getMessages } from "../../src/popup/i18n/index";

const t = getMessages();

describe("ErrorCard", () => {
  it("renders rate_limited copy and retry button", () => {
    const onRetry = vi.fn();
    const { container } = renderComponent(ErrorCard, { code: "rate_limited", onRetry });
    expect(container.textContent).toContain(t.errors.rate_limited);
    const btn = container.querySelector("button") as HTMLButtonElement;
    btn.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders token_revoked copy and newAlias button → calls onNewAlias", () => {
    const onNewAlias = vi.fn();
    const { container } = renderComponent(ErrorCard, { code: "token_revoked", onNewAlias });
    expect(container.textContent).toContain(t.errors.token_revoked);
    (container.querySelector("button") as HTMLButtonElement).click();
    expect(onNewAlias).toHaveBeenCalledOnce();
  });

  it("renders alias_expired copy and newAlias button", () => {
    const onNewAlias = vi.fn();
    const { container } = renderComponent(ErrorCard, { code: "alias_expired", onNewAlias });
    expect(container.textContent).toContain(t.errors.alias_expired);
    (container.querySelector("button") as HTMLButtonElement).click();
    expect(onNewAlias).toHaveBeenCalledOnce();
  });

  it("renders network_unavailable copy and retry button", () => {
    const onRetry = vi.fn();
    const { container } = renderComponent(ErrorCard, { code: "network_unavailable", onRetry });
    expect(container.textContent).toContain(t.errors.network_unavailable);
    (container.querySelector("button") as HTMLButtonElement).click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders domain_blocked copy and fallback button → calls onFallback", () => {
    const onFallback = vi.fn();
    const { container } = renderComponent(ErrorCard, { code: "domain_blocked", onFallback });
    expect(container.textContent).toContain(t.errors.domain_blocked);
    (container.querySelector("button") as HTMLButtonElement).click();
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("renders unknown copy with no action button", () => {
    const { container } = renderComponent(ErrorCard, { code: "unknown" });
    expect(container.textContent).toContain(t.errors.unknown);
    expect(container.querySelector("button")).toBeNull();
  });

  it("has ARIA role=alert", () => {
    const { container } = renderComponent(ErrorCard, { code: "unknown" });
    expect(container.querySelector(".sm-error-card")?.getAttribute("role")).toBe("alert");
  });
});
