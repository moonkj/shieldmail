/**
 * Component tests for ModePill — mode selection button.
 */
import { describe, it, expect, vi } from "vitest";
import { ModePill } from "../../src/popup/components/ModePill";
import { renderComponent } from "./_render";

describe("ModePill", () => {
  it("renders the label and description", () => {
    const { container } = renderComponent(ModePill, {
      mode: "developer",
      selected: false,
      label: "Dev/QA",
      description: "Fast iteration",
      onSelect: vi.fn(),
    });
    expect(container.textContent).toContain("Dev/QA");
    expect(container.textContent).toContain("Fast iteration");
  });

  it("adds selected class when selected=true", () => {
    const { container } = renderComponent(ModePill, {
      mode: "developer",
      selected: true,
      label: "Dev",
      description: "desc",
      onSelect: vi.fn(),
    });
    const btn = container.querySelector("button");
    expect(btn?.className).toContain("selected");
  });

  it("does not have selected class when selected=false", () => {
    const { container } = renderComponent(ModePill, {
      mode: "everyday",
      selected: false,
      label: "Everyday",
      description: "desc",
      onSelect: vi.fn(),
    });
    const btn = container.querySelector("button");
    expect(btn?.className).not.toContain("selected");
  });

  it("calls onSelect with mode when clicked", () => {
    const onSelect = vi.fn();
    const { container } = renderComponent(ModePill, {
      mode: "everyday",
      selected: false,
      label: "Everyday",
      description: "desc",
      onSelect,
    });
    const btn = container.querySelector("button") as HTMLButtonElement;
    btn.click();
    expect(onSelect).toHaveBeenCalledWith("everyday");
  });

  it("has aria-pressed attribute", () => {
    const { container } = renderComponent(ModePill, {
      mode: "developer",
      selected: true,
      label: "Dev",
      description: "desc",
      onSelect: vi.fn(),
    });
    const btn = container.querySelector("button");
    expect(btn?.getAttribute("aria-pressed")).toBe("true");
  });
});
