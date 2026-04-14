/**
 * Component tests for TagChip — tag filter chip.
 */
import { describe, it, expect, vi } from "vitest";
import { TagChip } from "../../src/popup/components/TagChip";
import { renderComponent } from "./_render";

describe("TagChip", () => {
  it("renders the label text", () => {
    const { container } = renderComponent(TagChip, {
      label: "QA",
      selected: false,
      onClick: vi.fn(),
    });
    expect(container.textContent).toContain("QA");
  });

  it("adds selected class when selected=true", () => {
    const { container } = renderComponent(TagChip, {
      label: "Work",
      selected: true,
      onClick: vi.fn(),
    });
    const btn = container.querySelector("button");
    expect(btn?.className).toContain("selected");
  });

  it("does not have selected class when selected=false", () => {
    const { container } = renderComponent(TagChip, {
      label: "Shopping",
      selected: false,
      onClick: vi.fn(),
    });
    const btn = container.querySelector("button");
    expect(btn?.className).not.toContain("selected");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    const { container } = renderComponent(TagChip, {
      label: "All",
      selected: false,
      onClick,
    });
    const btn = container.querySelector("button") as HTMLButtonElement;
    btn.click();
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("has aria-pressed attribute", () => {
    const { container } = renderComponent(TagChip, {
      label: "Test",
      selected: true,
      onClick: vi.fn(),
    });
    const btn = container.querySelector("button");
    expect(btn?.getAttribute("aria-pressed")).toBe("true");
  });
});
