/**
 * Unit tests for scorer.ts — gates A/B/C, threshold, multi-step boost.
 */
import { describe, it, expect, beforeEach } from "vitest";
import "./_dom";
import { mountHTML, setLocation, setTitle } from "./_dom";
import { evaluateForm, ACTIVATION_THRESHOLD } from "../../../src/content/detect/scorer";

const INTENT_KEY = "shieldmail:recentSignupIntent";

function buildRichSignupForm(): HTMLFormElement {
  // This form is designed to hit: S1(URL), S2(title), S3(button text),
  // S4(two pwd), S5(terms), S6(heading), S7(action), S8(privacy link),
  // S10(3 social buttons). Many categories, score well above 0.70.
  document.body.innerHTML = `
    <section>
      <h1>Create your account</h1>
      <form action="/users/register">
        <input type="email" name="email" placeholder="Email"/>
        <input type="password" name="pw"/>
        <input type="password" name="pw2"/>
        <label><input type="checkbox" name="tos"/>I agree to the Terms</label>
        <a href="/privacy">Privacy Policy</a>
        <button>Continue with Google</button>
        <button>Sign up with Apple</button>
        <button>Sign up with GitHub</button>
        <button type="submit">Create account</button>
      </form>
    </section>
  `;
  return document.querySelector("form") as HTMLFormElement;
}

describe("evaluateForm — gates", () => {
  beforeEach(() => {
    sessionStorage.clear();
    setLocation("/");
    setTitle("");
  });

  it("Gate A — no email field → score 0, not activated, not reject", () => {
    setLocation("/signup");
    setTitle("Sign up");
    const form = mountHTML('<form><input type="text" name="x"/></form>');
    const r = evaluateForm(form as HTMLFormElement);
    expect(r.score).toBe(0);
    expect(r.activated).toBe(false);
    expect(r.reject).toBe(false);
    expect(r.emailField).toBeNull();
  });

  it("Gate B — S11 pure login hard reject", () => {
    setLocation("/login");
    setTitle("Sign in");
    const form = mountHTML(
      '<form><input type="email" name="email"/><button>Sign in</button></form>'
    );
    const r = evaluateForm(form as HTMLFormElement);
    expect(r.reject).toBe(true);
    expect(r.activated).toBe(false);
  });

  it("R2 regression — login page with email field does NOT activate", () => {
    setLocation("/login");
    setTitle("Log in");
    const form = mountHTML(
      '<form action="/session">' +
        '<input type="email" name="email"/>' +
        '<input type="password" name="pw"/>' +
        '<button>Log in</button>' +
      '</form>'
    );
    const r = evaluateForm(form as HTMLFormElement);
    expect(r.activated).toBe(false);
    expect(r.reject).toBe(true);
  });

  it("Gate C — only 1 positive category → score halved", () => {
    // Only URL category hit (S1). No title, no buttons that match, no other signals.
    setLocation("/signup");
    setTitle("");
    const form = mountHTML(
      '<form action="/session"><input type="email" name="email"/></form>'
    );
    const r = evaluateForm(form as HTMLFormElement);
    // S1 weight 0.35 * 0.5 = 0.175
    expect(r.score).toBeCloseTo(0.175, 3);
    expect(r.activated).toBe(false);
  });

  it("activates on a rich signup form (score well above threshold)", () => {
    setLocation("/users/register");
    setTitle("Sign up for the service");
    const form = buildRichSignupForm();
    const r = evaluateForm(form);
    expect(r.reject).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(ACTIVATION_THRESHOLD);
    expect(r.activated).toBe(true);
    expect(r.categories.length).toBeGreaterThanOrEqual(2);
  });

  it("threshold boundary — just below 0.70 does NOT activate", () => {
    // Force a score right below threshold via a custom threshold option.
    setLocation("/signup");
    setTitle("Sign up");
    const form = mountHTML(
      '<form><input type="email"/><button>Sign up</button></form>'
    );
    // Custom high threshold to keep activation from firing
    const r = evaluateForm(form as HTMLFormElement, document, { threshold: 0.99 });
    expect(r.activated).toBe(false);
  });

  it("threshold boundary — at/above 0.70 activates with custom threshold", () => {
    setLocation("/signup");
    setTitle("Sign up");
    const form = mountHTML(
      '<form><input type="email"/><button>Sign up</button></form>'
    );
    const r = evaluateForm(form as HTMLFormElement, document, { threshold: 0.1 });
    expect(r.activated).toBe(true);
  });

  it("multi-step boost — sessionStorage intent adds +0.15", () => {
    sessionStorage.setItem(
      INTENT_KEY,
      JSON.stringify({ origin: window.location.origin, ts: Date.now() })
    );
    setLocation("/signup/step2");
    setTitle("");
    const form = mountHTML(
      '<form action="/session"><input type="email" name="email"/></form>'
    );
    const r = evaluateForm(form as HTMLFormElement);
    // S1 only = 0.175 (halved). Boost +0.15 → 0.325
    expect(r.score).toBeCloseTo(0.325, 3);
  });

  it("multi-step boost — stale intent (>10min) is ignored", () => {
    sessionStorage.setItem(
      INTENT_KEY,
      JSON.stringify({
        origin: window.location.origin,
        ts: Date.now() - 11 * 60 * 1000,
      })
    );
    setLocation("/signup");
    const form = mountHTML(
      '<form action="/session"><input type="email"/></form>'
    );
    const r = evaluateForm(form as HTMLFormElement);
    expect(r.score).toBeCloseTo(0.175, 3);
  });

  it("multi-step boost — wrong origin intent is ignored", () => {
    sessionStorage.setItem(
      INTENT_KEY,
      JSON.stringify({ origin: "https://evil.example", ts: Date.now() })
    );
    setLocation("/signup");
    const form = mountHTML(
      '<form action="/session"><input type="email"/></form>'
    );
    const r = evaluateForm(form as HTMLFormElement);
    expect(r.score).toBeCloseTo(0.175, 3);
  });

  it("writes intent to sessionStorage on activation", () => {
    setLocation("/users/register");
    setTitle("Sign up for the service");
    const form = buildRichSignupForm();
    evaluateForm(form);
    const raw = sessionStorage.getItem(INTENT_KEY);
    expect(raw).toBeTruthy();
  });

  it("S12 newsletter attenuation reduces score", () => {
    setLocation("/");
    setTitle("Newsletter");
    const form = mountHTML(
      '<form><input type="email" name="email"/><button>Subscribe</button></form>'
    );
    const r = evaluateForm(form as HTMLFormElement);
    // Should definitely not activate
    expect(r.activated).toBe(false);
  });

  it("score is clamped to [0,1]", () => {
    setLocation("/users/register");
    setTitle("Sign up");
    const form = buildRichSignupForm();
    const r = evaluateForm(form);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it("matched array excludes S11 when not matched", () => {
    setLocation("/users/register");
    setTitle("Sign up");
    const form = buildRichSignupForm();
    const r = evaluateForm(form);
    expect(r.matched.find((m) => m.id === "S11")).toBeUndefined();
  });

  it("Gate C — rich form has >=2 positive categories", () => {
    setLocation("/users/register");
    setTitle("Sign up");
    const r = evaluateForm(buildRichSignupForm());
    const cats = new Set(r.categories);
    expect(cats.size).toBeGreaterThanOrEqual(2);
  });
});
