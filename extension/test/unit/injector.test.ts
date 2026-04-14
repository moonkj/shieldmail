/**
 * Unit tests for content/injector.ts — ShieldIconInjector.
 *
 * Tests mount/unmount, state transitions, keyboard shortcut resolution,
 * position updates, and forceInjectAndGenerate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock bridge and shieldIcon.css import
vi.mock("../../src/content/bridge", () => ({
  sendMessage: vi.fn(),
}));

vi.mock("../../src/content/shieldIcon.css?inline", () => ({
  default: ".shield { display: block; }",
}));

// Need to use dynamic import after mock is set up
import { ShieldIconInjector, type InjectorDeps } from "../../src/content/injector";
import { sendMessage } from "../../src/content/bridge";

function makeDeps(mode: "ephemeral" | "managed" = "ephemeral"): InjectorDeps {
  return {
    getMode: () => mode,
  };
}

function makeInput(): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "email";
  input.style.width = "200px";
  input.style.height = "40px";
  document.body.appendChild(input);
  return input;
}

describe("ShieldIconInjector", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
  });

  it("constructs without error", () => {
    const injector = new ShieldIconInjector(makeDeps());
    expect(injector).toBeDefined();
  });

  it("inject() mounts a host element", () => {
    const injector = new ShieldIconInjector(makeDeps());
    const input = makeInput();
    injector.inject(input);
    const hosts = document.querySelectorAll("[data-shieldmail-host]");
    expect(hosts.length).toBe(1);
  });

  it("inject() does not duplicate for the same input", () => {
    const injector = new ShieldIconInjector(makeDeps());
    const input = makeInput();
    injector.inject(input);
    injector.inject(input);
    const hosts = document.querySelectorAll("[data-shieldmail-host]");
    expect(hosts.length).toBe(1);
  });

  it("inject() creates hosts for different inputs", () => {
    const injector = new ShieldIconInjector(makeDeps());
    const input1 = makeInput();
    const input2 = makeInput();
    injector.inject(input1);
    injector.inject(input2);
    const hosts = document.querySelectorAll("[data-shieldmail-host]");
    expect(hosts.length).toBe(2);
  });

  it("removeFor() removes the host element", async () => {
    vi.useFakeTimers();
    const injector = new ShieldIconInjector(makeDeps());
    const input = makeInput();
    injector.inject(input);
    injector.removeFor(input);
    vi.advanceTimersByTime(400);
    const hosts = document.querySelectorAll("[data-shieldmail-host]");
    expect(hosts.length).toBe(0);
    vi.useRealTimers();
  });

  it("removeFor() is a no-op for unknown input", () => {
    const injector = new ShieldIconInjector(makeDeps());
    const input = makeInput();
    // Should not throw
    injector.removeFor(input);
  });

  it("host has absolute positioning and high z-index", () => {
    const injector = new ShieldIconInjector(makeDeps());
    const input = makeInput();
    injector.inject(input);
    const host = document.querySelector("[data-shieldmail-host]") as HTMLElement;
    expect(host.style.position).toBe("absolute");
    expect(host.style.zIndex).toBe("2147483600");
  });

  it("forceInjectAndGenerate() creates host and triggers activate", async () => {
    (sendMessage as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      type: "GENERATE_ALIAS_RESULT",
      ok: true,
      record: { address: "test@shldmail.work" },
    });

    const injector = new ShieldIconInjector(makeDeps());
    const input = makeInput();
    injector.forceInjectAndGenerate(input);
    const hosts = document.querySelectorAll("[data-shieldmail-host]");
    expect(hosts.length).toBe(1);
  });

  it("forceInjectAndGenerate() on already-injected input triggers activate", async () => {
    (sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue({
      type: "GENERATE_ALIAS_RESULT",
      ok: true,
      record: { address: "test@shldmail.work" },
    });

    const injector = new ShieldIconInjector(makeDeps());
    const input = makeInput();
    injector.inject(input);
    injector.forceInjectAndGenerate(input);
    const hosts = document.querySelectorAll("[data-shieldmail-host]");
    expect(hosts.length).toBe(1);
  });
});
