/**
 * Component tests for LoadingSkeleton — accessibility and rendering.
 */
import { describe, it, expect } from "vitest";
import { LoadingSkeleton } from "../../src/popup/components/LoadingSkeleton";
import { renderComponent } from "./_render";
import { getMessages } from "../../src/popup/i18n/index";

const t = getMessages();

describe("LoadingSkeleton", () => {
  it("renders the waiting text", () => {
    const { container } = renderComponent(LoadingSkeleton, {});
    expect(container.textContent).toContain(t.main.waiting);
  });

  it("has role=status for accessibility", () => {
    const { container } = renderComponent(LoadingSkeleton, {});
    const el = container.querySelector("[role='status']");
    expect(el).not.toBeNull();
  });

  it("has aria-live=polite", () => {
    const { container } = renderComponent(LoadingSkeleton, {});
    const el = container.querySelector(".sm-skeleton");
    expect(el?.getAttribute("aria-live")).toBe("polite");
  });

  it("renders 6 skeleton bars", () => {
    const { container } = renderComponent(LoadingSkeleton, {});
    const bars = container.querySelectorAll(".sm-skeleton-bar");
    expect(bars.length).toBe(6);
  });

  it("renders a progress bar", () => {
    const { container } = renderComponent(LoadingSkeleton, {});
    const progress = container.querySelector(".sm-progress-bar");
    expect(progress).not.toBeNull();
  });
});
