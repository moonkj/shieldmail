/**
 * Unit tests for content/observer.ts — SignupObserver.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "./detect/_dom";
import { SignupObserver, type ObserverDeps } from "../../src/content/observer";

function makeDeps(): ObserverDeps & {
  onActivated: ReturnType<typeof vi.fn>;
  onDeactivated: ReturnType<typeof vi.fn>;
} {
  return {
    onActivated: vi.fn(),
    onDeactivated: vi.fn(),
    threshold: () => 0.7,
  };
}

describe("SignupObserver", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("constructs without error", () => {
    const deps = makeDeps();
    const observer = new SignupObserver(deps);
    expect(observer).toBeDefined();
  });

  it("start() begins observing", () => {
    const deps = makeDeps();
    const observer = new SignupObserver(deps);
    // Should not throw
    observer.start();
    observer.stop();
  });

  it("stop() disconnects observer", () => {
    const deps = makeDeps();
    const observer = new SignupObserver(deps);
    observer.start();
    observer.stop();
    // Double stop should be safe
    observer.stop();
  });

  it("evaluates forms on start and calls onActivated for signup forms", async () => {
    document.body.innerHTML = `
      <form action="/signup">
        <input type="email" name="email" />
        <input type="password" name="password" />
        <input type="password" name="confirm_password" />
        <button type="submit">Sign up</button>
      </form>
    `;

    const deps = makeDeps();
    const observer = new SignupObserver(deps);
    observer.start();

    // Give the observer time to evaluate (it runs synchronously on start)
    await new Promise((r) => setTimeout(r, 50));

    expect(deps.onActivated).toHaveBeenCalled();
    observer.stop();
  });

  it("does NOT call onActivated for a simple login form", async () => {
    document.body.innerHTML = `
      <form action="/login">
        <input type="email" name="email" />
        <input type="password" name="password" />
        <button type="submit">Log in</button>
      </form>
    `;
    // Set the title to login
    document.title = "Login";

    const deps = makeDeps();
    const observer = new SignupObserver(deps);
    observer.start();

    await new Promise((r) => setTimeout(r, 50));

    // Login should be hard-rejected by S11
    expect(deps.onActivated).not.toHaveBeenCalled();
    observer.stop();
    document.title = "";
  });
});
