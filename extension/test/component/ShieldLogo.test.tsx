/**
 * Component tests for ShieldLogo — SVG rendering and accessibility.
 */
import { describe, it, expect } from "vitest";
import { ShieldLogo } from "../../src/popup/components/ShieldLogo";
import { renderComponent } from "./_render";

describe("ShieldLogo", () => {
  it("renders an SVG element", () => {
    const { container } = renderComponent(ShieldLogo, {});
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });

  it("uses default size of 24", () => {
    const { container } = renderComponent(ShieldLogo, {});
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("24");
    expect(svg?.getAttribute("height")).toBe("24");
  });

  it("uses custom size when provided", () => {
    const { container } = renderComponent(ShieldLogo, { size: 64 });
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("64");
    expect(svg?.getAttribute("height")).toBe("64");
  });

  it("has role=img for accessibility", () => {
    const { container } = renderComponent(ShieldLogo, {});
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("role")).toBe("img");
  });

  it("has default aria-label of ShieldMail", () => {
    const { container } = renderComponent(ShieldLogo, {});
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("ShieldMail");
  });

  it("uses custom title as aria-label", () => {
    const { container } = renderComponent(ShieldLogo, { title: "Custom" });
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-label")).toBe("Custom");
  });

  it("contains gradient definition", () => {
    const { container } = renderComponent(ShieldLogo, {});
    const gradient = container.querySelector("linearGradient");
    expect(gradient).not.toBeNull();
  });
});
