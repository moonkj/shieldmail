/**
 * Component tests for OtpBox — render, auto-copy, consume callback.
 */
import { describe, it, expect, vi } from "vitest";
import { OtpBox } from "../../src/popup/components/OtpBox";
import { renderComponent, flush } from "./_render";

describe("OtpBox", () => {
  it("renders placeholder when no otp", () => {
    const { container } = renderComponent(OtpBox, { autoCopy: false });
    expect(container.querySelector(".sm-otp-digits")?.textContent).toBe("------");
  });

  it("renders the OTP digits", () => {
    const { container } = renderComponent(OtpBox, {
      otp: "123456",
      autoCopy: false,
    });
    expect(container.querySelector(".sm-otp-digits")?.textContent).toBe("123456");
  });

  it("auto-copies to clipboard on mount when autoCopy=true and calls onConsumed", async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: write },
    });
    const onConsumed = vi.fn();
    renderComponent(OtpBox, {
      otp: "987654",
      autoCopy: true,
      messageId: "m1",
      onConsumed,
    });
    await flush();
    await flush();
    expect(write).toHaveBeenCalledWith("987654");
    expect(onConsumed).toHaveBeenCalledWith("m1");
  });

  it("does NOT auto-copy when autoCopy=false", async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: write },
    });
    renderComponent(OtpBox, { otp: "111222", autoCopy: false });
    await flush();
    expect(write).not.toHaveBeenCalled();
  });

  it("manual copy button click writes to clipboard", async () => {
    const write = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: write },
    });
    const onConsumed = vi.fn();
    const { container } = renderComponent(OtpBox, {
      otp: "444555",
      autoCopy: false,
      messageId: "m2",
      onConsumed,
    });
    const btn = container.querySelector("button") as HTMLButtonElement;
    btn.click();
    await flush();
    expect(write).toHaveBeenCalledWith("444555");
    expect(onConsumed).toHaveBeenCalledWith("m2");
  });

  it("does not log the OTP to console", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    renderComponent(OtpBox, { otp: "secret42", autoCopy: true, messageId: "m3" });
    for (const spy of [logSpy, errSpy, warnSpy]) {
      for (const call of spy.mock.calls) {
        for (const arg of call) {
          expect(String(arg)).not.toContain("secret42");
        }
      }
    }
  });

  it("has correct ARIA role and label", () => {
    const { container } = renderComponent(OtpBox, { otp: "111", autoCopy: false });
    const box = container.querySelector(".sm-otp-box");
    expect(box?.getAttribute("role")).toBe("group");
    expect(box?.getAttribute("aria-label")).toBeTruthy();
    expect(box?.getAttribute("aria-live")).toBe("polite");
  });
});
