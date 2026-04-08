/**
 * Alias id + domain selection.
 *
 * O5 resolution: 14-char hex slice from `crypto.randomUUID` (56 bits,
 * 2^56 ≈ 7.2×10^16 space). At 10M aliases the Birthday-Problem collision
 * probability is ~0.07% — safe through M4 scale. Caller retries on KV
 * collision (router.ts). Previous 10-char (40-bit) was unsafe at 500k+.
 */

/** 14-char alias id, lowercased hex/dashless. */
export function generateAliasId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 14);
}

/**
 * Pick a domain from the comma-separated DOMAIN_POOL env var with weighted
 * random (currently equal weights). For M1 the pool is typically a single
 * domain, but the function must already support rotation for M4.
 */
export function pickDomain(domainPool: string): string {
  const domains = domainPool
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d.length > 0);
  if (domains.length === 0) {
    throw new Error("pickDomain: DOMAIN_POOL is empty");
  }
  const idx = Math.floor(Math.random() * domains.length);
  // noUncheckedIndexedAccess: domains[idx] is `string | undefined`,
  // but idx ∈ [0, length) so it's always defined.
  const chosen = domains[idx];
  if (chosen === undefined) {
    // unreachable; satisfies the type checker
    throw new Error("pickDomain: index out of range");
  }
  return chosen;
}

export function fullAddress(aliasId: string, domain: string): string {
  return `${aliasId}@${domain}`;
}
