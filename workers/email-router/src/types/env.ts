/**
 * Worker bindings + secrets.
 * Mirrors wrangler.toml. Do NOT add fields here without updating
 * wrangler.toml or `wrangler secret put`.
 */
export interface Env {
  // KV
  ALIAS_KV: KVNamespace;

  // Durable Objects
  MSG_DO: DurableObjectNamespace;
  RATE_LIMIT: DurableObjectNamespace;
  DAILY_QUOTA: DurableObjectNamespace;

  // Vars
  DOMAIN_POOL: string;          // comma-separated, e.g. "d1.shld.me,d2.shld.me"
  MESSAGE_TTL_MS: string;       // numeric string, e.g. "600000"
  EPHEMERAL_ALIAS_TTL_SEC: string;
  POLL_TOKEN_TTL_SEC: string;

  // Secrets
  HMAC_KEY: string;             // wrangler secret put HMAC_KEY
  SENTRY_DSN?: string;
  ADMIN_IDS?: string;           // comma-separated admin IPs/deviceIds → always pro
}

/** Stored in ALIAS_KV under `alias:<id>`. */
export interface AliasRecord {
  mode: "ephemeral" | "managed";
  domain: string;
  createdAt: number;            // ms epoch
  expiresAt: number | null;     // ms epoch; null for managed
  tokenHash: string;            // hex hmac of pollToken (rotation guard)
  label?: string;
}
