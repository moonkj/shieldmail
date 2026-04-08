import { describe, it, expect } from "vitest";
import { htmlToText } from "../../src/parser/html.js";

/**
 * htmlToText is a minimal HTML→plaintext fallback used only by the OTP/link
 * extractors when postal-mime returns no text/plain alternative. It is
 * intentionally simple — see src/parser/html.ts for full strategy.
 */

describe("htmlToText", () => {
  it("returns empty string for empty input", () => {
    expect(htmlToText("")).toBe("");
  });

  it("converts <br> to newline", () => {
    expect(htmlToText("line1<br>line2")).toBe("line1\nline2");
  });

  it("converts </p> to newline", () => {
    expect(htmlToText("<p>one</p><p>two</p>")).toBe("one\ntwo");
  });

  it("strips <script> blocks completely (content removed)", () => {
    const out = htmlToText(
      "<p>before</p><script>var leak='secret123';</script><p>after</p>",
    );
    expect(out).not.toContain("secret123");
    expect(out).toContain("before");
    expect(out).toContain("after");
  });

  it("strips <style> blocks completely (content removed)", () => {
    const out = htmlToText("<style>body { color: red }</style><p>hi</p>");
    expect(out).not.toContain("color");
    expect(out).toContain("hi");
  });

  it("decodes named HTML entities", () => {
    expect(htmlToText("Tom &amp; Jerry &lt;3 &nbsp;you")).toContain(
      "Tom & Jerry <3",
    );
    expect(htmlToText("&quot;quoted&quot;")).toContain('"quoted"');
  });

  it("decodes numeric and hex entities", () => {
    expect(htmlToText("&#39;apos&#39;")).toContain("'apos'");
    expect(htmlToText("&#x41;")).toContain("A");
  });

  it("handles nested tags", () => {
    expect(
      htmlToText("<div><p>outer <span><b>inner</b></span></p></div>"),
    ).toContain("outer");
    expect(
      htmlToText("<div><p>outer <span><b>inner</b></span></p></div>"),
    ).toContain("inner");
  });

  it("does not throw on malformed HTML (unclosed tag)", () => {
    expect(() => htmlToText("<p>oops <a href= ")).not.toThrow();
  });

  it("collapses runs of whitespace and trims", () => {
    const out = htmlToText("<p>  hello   world   </p>");
    expect(out).toBe("hello world");
  });

  it("preserves a 6-digit OTP that was inside <h2>", () => {
    const out = htmlToText("<h2>Verification code: 824193</h2>");
    expect(out).toContain("824193");
    expect(out).toContain("Verification code");
  });
});
