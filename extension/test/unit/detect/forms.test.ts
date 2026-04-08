/**
 * Unit tests for forms.ts — findEmailLikeInput, discoverForms, SPA fallback.
 */
import { describe, it, expect } from "vitest";
import "./_dom";
import { mountHTML } from "./_dom";
import {
  findEmailLikeInput,
  discoverForms,
  isVisible,
} from "../../../src/content/detect/forms";

describe("findEmailLikeInput", () => {
  it("matches input[type=email]", () => {
    const form = mountHTML('<form><input type="email" name="x"/></form>');
    expect(findEmailLikeInput(form)?.name).toBe("x");
  });

  it("matches input[name=email]", () => {
    const form = mountHTML('<form><input type="text" name="email"/></form>');
    expect(findEmailLikeInput(form)).not.toBeNull();
  });

  it("matches Korean placeholder 이메일", () => {
    const form = mountHTML(
      '<form><input type="text" name="user" placeholder="이메일을 입력하세요"/></form>'
    );
    expect(findEmailLikeInput(form)).not.toBeNull();
  });

  it("matches via <label for=...>Email</label>", () => {
    document.body.innerHTML =
      '<form><label for="u">Email</label><input id="u" type="text"/></form>';
    const form = document.querySelector("form") as HTMLFormElement;
    expect(findEmailLikeInput(form)).not.toBeNull();
  });

  it("matches inputmode=email", () => {
    const form = mountHTML(
      '<form><input type="text" inputmode="email" name="u"/></form>'
    );
    expect(findEmailLikeInput(form)).not.toBeNull();
  });

  it("matches autocomplete=email", () => {
    const form = mountHTML(
      '<form><input type="text" autocomplete="email" name="u"/></form>'
    );
    expect(findEmailLikeInput(form)).not.toBeNull();
  });

  it("skips hidden and disabled inputs", () => {
    const form = mountHTML(
      '<form>' +
        '<input type="hidden" name="email" value="x"/>' +
        '<input type="email" disabled/>' +
      '</form>'
    );
    expect(findEmailLikeInput(form)).toBeNull();
  });

  it("returns null when no email-like input exists", () => {
    const form = mountHTML(
      '<form><input type="text" name="username"/></form>'
    );
    expect(findEmailLikeInput(form)).toBeNull();
  });
});

describe("discoverForms", () => {
  it("returns each <form> with its email field", () => {
    document.body.innerHTML =
      '<form id="a"><input type="email"/></form>' +
      '<form id="b"><input type="text" name="q"/></form>';
    const out = discoverForms(document);
    expect(out.length).toBeGreaterThanOrEqual(2);
    const a = out.find((c) => (c.form as HTMLElement).id === "a");
    expect(a?.emailField).not.toBeNull();
  });

  it("SPA fallback — form-less email input is discovered via section ancestor", () => {
    document.body.innerHTML =
      '<section><h1>Create account</h1><input type="email" name="email"/></section>';
    const out = discoverForms(document);
    expect(out.length).toBeGreaterThanOrEqual(1);
    const candidate = out[out.length - 1];
    expect(candidate.emailField).not.toBeNull();
    // Should NOT be a bare <div>
    expect(candidate.form.tagName.toLowerCase()).not.toBe("div");
  });

  it("SPA fallback — plain <div> container is not chosen when no semantic ancestor", () => {
    // Wrap in a shallow div only — forms.ts prefers section/main/article/role=form
    document.body.innerHTML =
      '<div><input type="email" name="email"/></div>';
    const out = discoverForms(document);
    // At minimum, the email field is found; if a container is chosen it must
    // not be a generic div — it may fall back to document.body.
    const cand = out[out.length - 1];
    expect(cand.emailField).not.toBeNull();
    expect(cand.form.tagName.toLowerCase()).not.toBe("div");
  });
});

describe("isVisible", () => {
  it("returns true for rendered element (patched rect)", () => {
    const el = mountHTML('<div>hi</div>');
    expect(isVisible(el)).toBe(true);
  });
  it("returns false for hidden attribute", () => {
    const el = mountHTML('<div hidden>hi</div>');
    expect(isVisible(el)).toBe(false);
  });
});
