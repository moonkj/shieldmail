/**
 * Unit tests for content/index.ts helper functions.
 *
 * These test the exported pure/semi-pure functions: safeOpen, findOtpTarget,
 * fillOtp, showOtpToast, copyText, findFirstOtpLikeInput, fillOtpField.
 *
 * The main() function is tested indirectly through integration tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// content/index.ts calls main() at module level which accesses chrome.* APIs.
// vi.stubGlobal from setup.ts only runs in beforeEach (after module import).
// We need a chrome stub available at import-time for main() to survive.
vi.hoisted(() => {
  const noop = () => {};
  const makeEvent = () => ({
    addListener: noop,
    removeListener: noop,
    hasListener: () => false,
  });
  const makeStorageArea = () => ({
    get: (keys: unknown, cb?: (r: Record<string, unknown>) => void) => {
      if (typeof cb === "function") { cb({}); return; }
      return Promise.resolve({});
    },
    set: () => Promise.resolve(),
    remove: () => Promise.resolve(),
    clear: () => Promise.resolve(),
  });
  (globalThis as unknown as Record<string, unknown>).chrome = {
    runtime: {
      id: "shieldmail-test",
      sendMessage: () => Promise.resolve({ ok: true }),
      onMessage: makeEvent(),
      onInstalled: makeEvent(),
      onStartup: makeEvent(),
      getURL: (p: string) => `chrome-extension://test/${p}`,
      lastError: undefined,
    },
    storage: {
      local: makeStorageArea(),
      session: makeStorageArea(),
      sync: makeStorageArea(),
      onChanged: makeEvent(),
    },
    tabs: {
      query: () => Promise.resolve([]),
      sendMessage: () => Promise.resolve({}),
      create: () => Promise.resolve({}),
      onUpdated: makeEvent(),
      onRemoved: makeEvent(),
    },
  };
});

// We need to import the functions. Since content/index.ts runs main() on load,
// we mock the dependencies that main() uses to avoid side effects.
vi.mock("../../src/content/injector", () => ({
  ShieldIconInjector: vi.fn().mockImplementation(() => ({
    inject: vi.fn(),
    removeFor: vi.fn(),
    forceInjectAndGenerate: vi.fn(),
  })),
}));

vi.mock("../../src/content/ios-injector", () => ({
  IOSFloatingButtonInjector: vi.fn().mockImplementation(() => ({
    show: vi.fn(),
    hide: vi.fn(),
    hideButton: vi.fn(),
    forceGenerate: vi.fn(),
  })),
  getLastGeneratedAlias: vi.fn(() => null),
  restorePersistedAlias: vi.fn(() => null),
  setOtpCallback: vi.fn(),
  setVerifyLinkCallback: vi.fn(),
}));

vi.mock("../../src/content/observer", () => ({
  SignupObserver: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    stop: vi.fn(),
  })),
}));

vi.mock("../../src/content/bridge", () => ({
  sendMessage: vi.fn(),
}));

// Import after mocks
import {
  safeOpen,
  findOtpTarget,
  fillOtp,
  showOtpToast,
  copyText,
  findFirstOtpLikeInput,
  fillOtpField,
  isIOS,
} from "../../src/content/index";

describe("safeOpen()", () => {
  let windowOpenSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    windowOpenSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  });

  afterEach(() => {
    windowOpenSpy.mockRestore();
  });

  it("opens https URLs", () => {
    safeOpen("https://example.com/verify");
    expect(windowOpenSpy).toHaveBeenCalledWith(
      "https://example.com/verify",
      "_blank",
      "noopener",
    );
  });

  it("opens http URLs", () => {
    safeOpen("http://example.com/verify");
    expect(windowOpenSpy).toHaveBeenCalledWith(
      "http://example.com/verify",
      "_blank",
      "noopener",
    );
  });

  it("blocks javascript: scheme", () => {
    safeOpen("javascript:alert(1)");
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it("blocks data: scheme", () => {
    safeOpen("data:text/html,<h1>bad</h1>");
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it("ignores malformed URLs", () => {
    safeOpen("not a valid url ://");
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });

  it("ignores empty string", () => {
    safeOpen("");
    expect(windowOpenSpy).not.toHaveBeenCalled();
  });
});

describe("isIOS()", () => {
  it("is a function", () => {
    expect(typeof isIOS).toBe("function");
  });
});

describe("findOtpTarget()", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finds input with autocomplete=one-time-code", () => {
    document.body.innerHTML = '<input type="text" autocomplete="one-time-code" />';
    const target = findOtpTarget();
    expect(target).not.toBeNull();
    expect(target?.kind).toBe("single");
  });

  it("finds input with inputmode=numeric and maxLength 4-8", () => {
    document.body.innerHTML = '<input type="text" inputmode="numeric" maxlength="6" />';
    const target = findOtpTarget();
    expect(target).not.toBeNull();
    expect(target?.kind).toBe("single");
  });

  it("finds input by name hint (otp)", () => {
    document.body.innerHTML = '<input type="text" name="otp-code" />';
    const target = findOtpTarget();
    expect(target).not.toBeNull();
    expect(target?.kind).toBe("single");
  });

  it("finds input by placeholder hint (인증)", () => {
    document.body.innerHTML = '<input type="text" placeholder="인증코드" />';
    const target = findOtpTarget();
    expect(target).not.toBeNull();
    expect(target?.kind).toBe("single");
  });

  it("returns null when no OTP-like input exists", () => {
    document.body.innerHTML = '<input type="text" name="username" />';
    const target = findOtpTarget();
    expect(target).toBeNull();
  });

  it("skips hidden inputs", () => {
    document.body.innerHTML = '<input type="hidden" name="otp" />';
    const target = findOtpTarget();
    expect(target).toBeNull();
  });

  it("skips disabled inputs", () => {
    document.body.innerHTML = '<input type="text" name="otp" disabled />';
    const target = findOtpTarget();
    expect(target).toBeNull();
  });
});

describe("fillOtp()", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("fills a single OTP input and returns true", () => {
    document.body.innerHTML = '<input type="text" autocomplete="one-time-code" />';
    const result = fillOtp("123456");
    const input = document.querySelector("input")!;
    expect(input.value).toBe("123456");
    expect(result).toBe(true);
  });

  it("returns false when no OTP target is found", () => {
    document.body.innerHTML = '<input type="text" name="username" />';
    const result = fillOtp("123456");
    expect(result).toBe(false);
  });

  it("dispatches input and change events", () => {
    document.body.innerHTML = '<input type="text" autocomplete="one-time-code" />';
    const input = document.querySelector("input")!;
    const inputHandler = vi.fn();
    const changeHandler = vi.fn();
    input.addEventListener("input", inputHandler);
    input.addEventListener("change", changeHandler);

    fillOtp("999888");
    expect(inputHandler).toHaveBeenCalled();
    expect(changeHandler).toHaveBeenCalled();
  });
});

describe("showOtpToast()", () => {
  afterEach(() => {
    document.querySelectorAll("[data-shieldmail-toast]").forEach((e) => e.remove());
    document.querySelectorAll("[data-shieldmail-status]").forEach((e) => e.remove());
  });

  it("creates a toast element with the OTP code", () => {
    showOtpToast("654321");
    const toast = document.querySelector("[data-shieldmail-toast]");
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain("654321");
  });

  it("creates a toast with label text", () => {
    showOtpToast("111222");
    const toast = document.querySelector("[data-shieldmail-toast]");
    expect(toast?.textContent).toContain("인증 코드");
  });

  it("removes previous toast before creating new one", () => {
    showOtpToast("111111");
    showOtpToast("222222");
    const toasts = document.querySelectorAll("[data-shieldmail-toast]");
    expect(toasts.length).toBe(1);
    expect(toasts[0]?.textContent).toContain("222222");
  });

  it("toast is fixed position", () => {
    showOtpToast("333444");
    const toast = document.querySelector("[data-shieldmail-toast]") as HTMLElement;
    expect(toast.style.position).toBe("fixed");
  });
});

describe("copyText()", () => {
  beforeEach(() => {
    // happy-dom does not implement document.execCommand; stub it so copyText()
    // doesn't throw when it falls through to the textarea-based fallback path.
    if (typeof document.execCommand !== "function") {
      (document as unknown as Record<string, unknown>).execCommand = vi.fn(() => true);
    }
  });

  it("calls navigator.clipboard.writeText", () => {
    const writeSpy = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeSpy },
      configurable: true,
    });

    copyText("test123");
    expect(writeSpy).toHaveBeenCalledWith("test123");
  });

  it("uses textarea fallback for execCommand copy", () => {
    const execSpy = vi.fn(() => true);
    (document as unknown as Record<string, unknown>).execCommand = execSpy;
    copyText("fallback-text");
    expect(execSpy).toHaveBeenCalledWith("copy");
  });
});

describe("findFirstOtpLikeInput()", () => {
  // happy-dom's offsetParent is undefined (not null). The source code's
  // `!input.offsetParent` check treats undefined as hidden. Stub it to
  // simulate a visible element.
  function makeVisible(el: HTMLElement): void {
    Object.defineProperty(el, "offsetParent", { value: document.body, configurable: true });
  }

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finds single-char numeric input", () => {
    document.body.innerHTML = '<input type="text" inputmode="numeric" maxlength="1" />';
    makeVisible(document.querySelector("input")!);
    const input = findFirstOtpLikeInput();
    expect(input).not.toBeNull();
  });

  it("finds short numeric input", () => {
    document.body.innerHTML = '<input type="text" inputmode="numeric" maxlength="6" />';
    makeVisible(document.querySelector("input")!);
    const input = findFirstOtpLikeInput();
    expect(input).not.toBeNull();
  });

  it("finds tel type short input", () => {
    document.body.innerHTML = '<input type="tel" maxlength="6" />';
    makeVisible(document.querySelector("input")!);
    const input = findFirstOtpLikeInput();
    expect(input).not.toBeNull();
  });

  it("returns null when no OTP-like input exists", () => {
    document.body.innerHTML = '<input type="text" name="username" maxlength="100" />';
    makeVisible(document.querySelector("input")!);
    const input = findFirstOtpLikeInput();
    expect(input).toBeNull();
  });
});

describe("fillOtpField()", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("fills the given input with OTP", () => {
    document.body.innerHTML = '<input type="text" name="username" />';
    const input = document.querySelector("input")!;
    fillOtpField(input, "987654");
    expect(input.value).toBe("987654");
  });

  it("dispatches input and change events", () => {
    document.body.innerHTML = '<input type="text" />';
    const input = document.querySelector("input")!;
    const inputHandler = vi.fn();
    const changeHandler = vi.fn();
    input.addEventListener("input", inputHandler);
    input.addEventListener("change", changeHandler);

    fillOtpField(input, "111222");
    expect(inputHandler).toHaveBeenCalled();
    expect(changeHandler).toHaveBeenCalled();
  });
});
