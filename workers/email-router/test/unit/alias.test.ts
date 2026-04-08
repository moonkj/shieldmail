import { describe, it, expect } from "vitest";
import { generateAliasId, pickDomain, fullAddress } from "../../src/lib/alias.js";

/**
 * generateAliasId / pickDomain / fullAddress.
 *
 * Pure functions over crypto.randomUUID + Math.random. Not exhaustive
 * statistical tests — those belong elsewhere — but enough to catch
 * format regressions and the empty-pool case.
 */

describe("generateAliasId", () => {
  it("returns a 14-character string", () => {
    const id = generateAliasId();
    expect(id.length).toBe(14);
  });

  it("contains only lowercase hex characters (no dashes)", () => {
    const id = generateAliasId();
    expect(id).toMatch(/^[0-9a-f]{14}$/);
  });

  it("produces no collisions in 1000 generations (smoke)", () => {
    // 14 hex chars = 16^14 ≈ 7.2e16 (56-bit). 1000 picks → birthday prob ~ 7e-12.
    // This is a smoke test, not a statistical proof.
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) set.add(generateAliasId());
    expect(set.size).toBe(1000);
  });
});

describe("pickDomain", () => {
  it("returns the only domain when pool has one entry", () => {
    expect(pickDomain("d1.shld.me")).toBe("d1.shld.me");
  });

  it("returns one of the pool entries when pool has multiple", () => {
    const pool = "d1.shld.me,d2.shld.me,d3.shld.me";
    const choices = new Set<string>();
    for (let i = 0; i < 50; i++) choices.add(pickDomain(pool));
    for (const c of choices) {
      expect(["d1.shld.me", "d2.shld.me", "d3.shld.me"]).toContain(c);
    }
  });

  it("trims whitespace and ignores empty entries", () => {
    expect(pickDomain("  d1.shld.me  , , ")).toBe("d1.shld.me");
  });

  it("throws when the pool is empty", () => {
    expect(() => pickDomain("")).toThrowError(/empty/);
    expect(() => pickDomain(", , ,")).toThrowError(/empty/);
  });
});

describe("fullAddress", () => {
  it("joins alias and domain with @", () => {
    expect(fullAddress("u8af2k3", "d1.shld.me")).toBe("u8af2k3@d1.shld.me");
  });
});
