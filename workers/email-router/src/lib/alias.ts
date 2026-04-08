/**
 * Alias id + domain selection.
 *
 * Per ARCHITECTURE.md decision O5: 10-char slice from `crypto.randomUUID`
 * is acceptable for M1; collision probability calc + retry strategy is
 * tracked but not blocking.
 */

/** 10-char alias id, lowercased hex/dashless. */
export function generateAliasId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
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
