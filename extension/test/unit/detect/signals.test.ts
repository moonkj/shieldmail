/**
 * Unit tests for 12 detection signals (S1..S12).
 * See ARCHITECTURE.md §4 and signals.ts for specification.
 */
import { describe, it, expect } from "vitest";
import "./_dom";
import { mountHTML, setLocation, setTitle, ctx } from "./_dom";
import {
  s1, s2, s3, s4, s5, s6, s7, s8, s9, s10, s11, s12,
} from "../../../src/content/detect/signals";

describe("S1 — URL path", () => {
  it("matches /signup", () => {
    setLocation("/signup");
    const form = mountHTML("<form></form>");
    expect(s1(ctx(form)).matched).toBe(true);
  });
  it("matches /register", () => {
    setLocation("/register");
    expect(s1(ctx(mountHTML("<form></form>"))).matched).toBe(true);
  });
  it("matches /join/abc", () => {
    setLocation("/join/abc");
    expect(s1(ctx(mountHTML("<form></form>"))).matched).toBe(true);
  });
  it("matches Korean 회원가입 path", () => {
    setLocation("/회원가입");
    expect(s1(ctx(mountHTML("<form></form>"))).matched).toBe(true);
  });
  it("does NOT match /login", () => {
    setLocation("/login");
    expect(s1(ctx(mountHTML("<form></form>"))).matched).toBe(false);
  });
  it("does NOT match plain /", () => {
    setLocation("/");
    expect(s1(ctx(mountHTML("<form></form>"))).matched).toBe(false);
  });
});

describe("S2 — title keyword", () => {
  it("matches 'Sign up for GitHub'", () => {
    setTitle("Sign up for GitHub");
    expect(s2(ctx(mountHTML("<form></form>"))).matched).toBe(true);
  });
  it("matches '회원가입 - 서비스'", () => {
    setTitle("회원가입 - 서비스");
    expect(s2(ctx(mountHTML("<form></form>"))).matched).toBe(true);
  });
  it("does NOT match 'Log in'", () => {
    setTitle("Log in");
    expect(s2(ctx(mountHTML("<form></form>"))).matched).toBe(false);
  });
});

describe("S3 — submit button text", () => {
  it("matches button text 'Create account'", () => {
    const form = mountHTML("<form><button>Create account</button></form>");
    expect(s3(ctx(form)).matched).toBe(true);
  });
  it("matches 가입하기", () => {
    const form = mountHTML("<form><button>가입하기</button></form>");
    expect(s3(ctx(form)).matched).toBe(true);
  });
  it("does NOT match generic 'Submit'", () => {
    const form = mountHTML("<form><button>Submit</button></form>");
    expect(s3(ctx(form)).matched).toBe(false);
  });
});

describe("S4 — password confirm field", () => {
  it("does NOT match a single password field", () => {
    const form = mountHTML('<form><input type="password" name="pw"/></form>');
    expect(s4(ctx(form)).matched).toBe(false);
  });
  it("matches when 2 password fields are present", () => {
    const form = mountHTML(
      '<form><input type="password" name="pw"/><input type="password" name="pw2"/></form>'
    );
    expect(s4(ctx(form)).matched).toBe(true);
  });
  it("matches a single pwd whose name contains 'confirm'", () => {
    const form = mountHTML(
      '<form><input type="password" name="confirm_password"/></form>'
    );
    expect(s4(ctx(form)).matched).toBe(true);
  });
});

describe("S5 — terms checkbox", () => {
  it("matches checkbox with '이용약관' label", () => {
    const form = mountHTML(
      '<form><label><input type="checkbox" name="tos"/>이용약관에 동의</label></form>'
    );
    expect(s5(ctx(form)).matched).toBe(true);
  });
  it("does NOT match a plain marketing checkbox", () => {
    const form = mountHTML(
      '<form><label><input type="checkbox" name="news"/>Subscribe to news</label></form>'
    );
    expect(s5(ctx(form)).matched).toBe(false);
  });
});

describe("S6 — form heading", () => {
  it("matches nearby h1 'Create your account'", () => {
    document.body.innerHTML =
      '<section><h1>Create your account</h1><form><input type="email"/></form></section>';
    const form = document.querySelector("form") as HTMLFormElement;
    expect(s6(ctx(form)).matched).toBe(true);
  });
  it("does NOT match 'Log in' heading", () => {
    document.body.innerHTML =
      '<section><h1>Log in</h1><form></form></section>';
    const form = document.querySelector("form") as HTMLFormElement;
    expect(s6(ctx(form)).matched).toBe(false);
  });
});

describe("S7 — form action URL", () => {
  it("matches action=/users/register", () => {
    const form = mountHTML('<form action="/users/register"></form>');
    expect(s7(ctx(form)).matched).toBe(true);
  });
  it("does NOT match action=/session", () => {
    const form = mountHTML('<form action="/session"></form>');
    expect(s7(ctx(form)).matched).toBe(false);
  });
});

describe("S8 — ToS/Privacy links", () => {
  it("matches anchor text 'Privacy Policy'", () => {
    const form = mountHTML('<form><a href="/privacy">Privacy Policy</a></form>');
    expect(s8(ctx(form)).matched).toBe(true);
  });
  it("does NOT match unrelated link", () => {
    const form = mountHTML('<form><a href="/home">Home</a></form>');
    expect(s8(ctx(form)).matched).toBe(false);
  });
});

describe("S9 — verification / captcha", () => {
  it("matches recaptcha iframe", () => {
    const form = mountHTML(
      '<form><iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe></form>'
    );
    expect(s9(ctx(form)).matched).toBe(true);
  });
  it("matches input[autocomplete=one-time-code]", () => {
    const form = mountHTML(
      '<form><input autocomplete="one-time-code" name="otp"/></form>'
    );
    expect(s9(ctx(form)).matched).toBe(true);
  });
});

describe("S10 — social login cluster", () => {
  it("matches 3 social login buttons", () => {
    const form = mountHTML(
      '<form>' +
        '<button>Continue with Google</button>' +
        '<button>Sign up with Apple</button>' +
        '<button>Sign up with GitHub</button>' +
      '</form>'
    );
    expect(s10(ctx(form)).matched).toBe(true);
  });
  it("does NOT match only 2 social buttons", () => {
    const form = mountHTML(
      '<form>' +
        '<button>Continue with Google</button>' +
        '<button>Sign up with Apple</button>' +
      '</form>'
    );
    expect(s10(ctx(form)).matched).toBe(false);
  });
});

describe("S11 — hard reject (pure login)", () => {
  it("marks pure /login page with 'Sign in' button as hardReject", () => {
    setLocation("/login");
    setTitle("Sign in");
    const form = mountHTML('<form><button>Sign in</button></form>');
    const r = s11(ctx(form));
    expect(r.matched).toBe(true);
    expect(r.hardReject).toBe(true);
  });
  it("R2 regression — login form with 2 password fields is NOT hard-reject", () => {
    setLocation("/login");
    setTitle("Sign in");
    const form = mountHTML(
      '<form>' +
        '<input type="password" name="pw"/>' +
        '<input type="password" name="pw2"/>' +
        '<button>Sign in</button>' +
      '</form>'
    );
    const r = s11(ctx(form));
    expect(r.matched).toBe(false);
    expect(r.hardReject).toBeFalsy();
  });
  it("does NOT reject when title contains 'Sign up'", () => {
    setLocation("/users/new");
    setTitle("Sign up");
    const form = mountHTML('<form><button>Sign in</button></form>');
    expect(s11(ctx(form)).hardReject).toBeFalsy();
  });
});

describe("S12 — newsletter attenuation", () => {
  it("matches email-only newsletter form with '구독' button", () => {
    setTitle("");
    const form = mountHTML(
      '<form><input type="email" name="email"/><button>구독하기</button></form>'
    );
    const r = s12(ctx(form));
    expect(r.matched).toBe(true);
    expect(r.weight).toBeLessThan(0);
  });
  it("does NOT match a form with more than 2 visible fields", () => {
    const form = mountHTML(
      '<form>' +
        '<input type="email"/>' +
        '<input type="password"/>' +
        '<input type="password"/>' +
        '<button>Subscribe</button>' +
      '</form>'
    );
    expect(s12(ctx(form)).matched).toBe(false);
  });
});
