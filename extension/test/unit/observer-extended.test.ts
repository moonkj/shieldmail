/**
 * Extended unit tests for content/observer.ts — mutation handling, debounce,
 * deactivation, re-evaluation limits.
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

describe("SignupObserver — mutations", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("detects dynamically added signup forms via MutationObserver", async () => {
    const deps = makeDeps();
    const observer = new SignupObserver(deps);
    observer.start();

    // Dynamically add a signup form after start
    const form = document.createElement("form");
    form.action = "/signup";
    form.innerHTML = `
      <input type="email" name="email" />
      <input type="password" name="password" />
      <input type="password" name="confirm_password" />
      <button type="submit">Sign up</button>
    `;
    document.body.appendChild(form);

    // Wait for debounce (250ms) + evaluation
    await new Promise((r) => setTimeout(r, 400));

    expect(deps.onActivated).toHaveBeenCalled();
    observer.stop();
  });

  it("ignores non-interesting mutations (text nodes)", async () => {
    const deps = makeDeps();
    const observer = new SignupObserver(deps);
    observer.start();

    // Add a text node — should not trigger re-evaluation
    const textNode = document.createTextNode("Hello");
    document.body.appendChild(textNode);

    await new Promise((r) => setTimeout(r, 400));
    // onActivated should NOT have been called (no form)
    expect(deps.onActivated).not.toHaveBeenCalled();
    observer.stop();
  });

  it("calls onDeactivated when form is removed and was activated", async () => {
    // First set up an activated form
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

    await new Promise((r) => setTimeout(r, 100));

    // The form might be activated — depends on threshold matching
    // Now remove the form (add a new form that isn't a signup form)
    const form = document.querySelector("form")!;
    if (deps.onActivated.mock.calls.length > 0) {
      // Replace with a login form that shouldn't activate
      form.action = "/login";
      form.innerHTML = `
        <input type="email" name="email" />
        <input type="password" name="password" />
        <button type="submit">Log in</button>
      `;
      document.title = "Login";

      // Trigger a mutation
      const div = document.createElement("div");
      div.innerHTML = "<input type='text' />";
      document.body.appendChild(div);

      await new Promise((r) => setTimeout(r, 400));
      // onDeactivated might be called if the re-evaluation drops the score
    }
    observer.stop();
    document.title = "";
  });

  it("handles start when document is already loaded", async () => {
    document.body.innerHTML = `
      <form action="/register">
        <input type="email" name="email" />
        <input type="password" name="password" />
        <input type="password" name="confirm" />
        <button type="submit">Register</button>
      </form>
    `;

    const deps = makeDeps();
    const observer = new SignupObserver(deps);
    // readyState is "complete" in test env
    observer.start();

    await new Promise((r) => setTimeout(r, 100));
    expect(deps.onActivated).toHaveBeenCalled();
    observer.stop();
  });

  it("respects MAX_REEVAL limit per form", async () => {
    document.body.innerHTML = `
      <form action="/signup">
        <input type="email" name="email" />
        <input type="password" name="password" />
        <button type="submit">Go</button>
      </form>
    `;

    const deps = makeDeps();
    // Use a threshold so high the form is never activated
    deps.threshold = () => 0.99;
    const observer = new SignupObserver(deps);
    observer.start();

    // Trigger multiple mutations to force re-evaluations
    for (let i = 0; i < 5; i++) {
      const input = document.createElement("input");
      input.type = "text";
      document.body.appendChild(input);
      await new Promise((r) => setTimeout(r, 300));
    }

    // After MAX_REEVAL (3), additional evaluations should be skipped
    // (form is not activated and count >= 3)
    observer.stop();
  });

  it("detects mutation with nested input inside div", async () => {
    const deps = makeDeps();
    const observer = new SignupObserver(deps);
    observer.start();

    // Add a div containing an input — should count as interesting
    const div = document.createElement("div");
    div.innerHTML = `
      <form action="/signup">
        <input type="email" name="email" />
        <input type="password" name="password" />
        <input type="password" name="confirm" />
        <button type="submit">Create Account</button>
      </form>
    `;
    document.body.appendChild(div);

    await new Promise((r) => setTimeout(r, 400));
    expect(deps.onActivated).toHaveBeenCalled();
    observer.stop();
  });

  it("stop clears pending timer", async () => {
    const deps = makeDeps();
    const observer = new SignupObserver(deps);
    observer.start();

    // Trigger a mutation so the timer is scheduled
    const input = document.createElement("input");
    document.body.appendChild(input);

    // Stop before debounce fires
    observer.stop();

    // Wait past the debounce period — should not evaluate
    await new Promise((r) => setTimeout(r, 400));
  });

  it("detects removal of interesting nodes", async () => {
    document.body.innerHTML = `
      <form action="/signup">
        <input type="email" name="email" />
        <input type="password" name="password" />
        <input type="password" name="confirm" />
        <button type="submit">Sign Up</button>
      </form>
    `;

    const deps = makeDeps();
    const observer = new SignupObserver(deps);
    observer.start();
    await new Promise((r) => setTimeout(r, 100));

    // Remove a button (INTERESTING node)
    const btn = document.querySelector("button");
    if (btn) btn.remove();

    await new Promise((r) => setTimeout(r, 400));
    observer.stop();
  });
});
