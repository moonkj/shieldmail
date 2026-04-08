# ShieldMail — Email Router Worker (M1)

Cloudflare Worker implementing the M1 milestone of the ShieldMail
architecture (`docs/ARCHITECTURE.md`):

- HTTP API (Hono) for alias generate/poll/stream/ack/delete
- Email Routing handler (`email()`) that parses incoming mail via
  `postal-mime`, extracts OTP + verification links, and pushes a
  whitelisted payload to the per-alias `AliasChannel` Durable Object.
- `AliasChannel` DO (per-alias message buffer with 10-min alarm TTL,
  polling endpoint, SSE endpoint, WebSocket hibernation **stub**).
- `TokenBucket` DO (basic per-key rate limiter).

## Layout

```
src/
  index.ts            Entry: default { fetch, email } + DO exports
  router.ts           Hono routes
  email.ts            Email Routing handler
  do/
    AliasChannel.ts   Per-alias message DO
    TokenBucket.ts    Rate limit DO
  parser/
    otp.ts            OTP extractor (multi-pattern + context scoring)
    links.ts          Verification link extractor
    html.ts           HTML → text fallback (no external dep)
  lib/
    hash.ts           HMAC-SHA256 helpers (WebCrypto)
    jwt.ts            HS256 JWT sign/verify (WebCrypto)
    alias.ts          generateAliasId / pickDomain
    sanitize.ts       sanitizeDoPayload — privacy whitelist
  types/
    env.ts            Env bindings + AliasRecord
    messages.ts       StoredMessage / DoPushPayload
```

## Develop

```sh
pnpm install   # or npm install / yarn
pnpm dev       # wrangler dev
pnpm typecheck # tsc --noEmit
```

> Dependencies are declared in `package.json` but **not installed** by
> the Coder. Run `pnpm install` (or equivalent) before `wrangler dev`.

## Deploy prerequisites

Before `pnpm deploy` you must replace placeholder values in
`wrangler.toml`:

1. **KV namespace** — create one and paste its `id` and `preview_id`
   into `[[kv_namespaces]]` for `ALIAS_KV`.
2. **Email Routing** — register `*@d1.shld.me` in the Cloudflare
   dashboard, route to this Worker.
3. **Routes** — uncomment and adjust the `[[routes]]` block to point
   `api.shld.me/*` at this Worker (replace `zone_name`).
4. **Secrets**:
   ```sh
   wrangler secret put HMAC_KEY      # required
   wrangler secret put SENTRY_DSN    # optional, M4
   ```
5. **DOMAIN_POOL** — `wrangler.toml` ships with `d1.shld.me`. For M4
   add comma-separated rotation: `d1.shld.me,d2.shld.me,...`.

## API quick reference

| Method | Path                            | Auth          | Notes                          |
| ------ | ------------------------------- | ------------- | ------------------------------ |
| POST   | `/alias/generate`               | none          | rate-limited per IP            |
| GET    | `/alias/:id/messages?since=ms`  | Bearer JWT    | polling                        |
| GET    | `/alias/:id/stream`             | Bearer JWT    | SSE                            |
| GET    | `/alias/:id/ws`                 | Bearer JWT    | **stub** (`throw "M4"`)        |
| POST   | `/alias/:id/ack`                | Bearer JWT    | wipes DO storage               |
| DELETE | `/alias/:id`                    | Bearer JWT    | wipes KV + DO                  |
| GET    | `/health`                       | none          |                                |

## Privacy invariants

The Email Worker MUST NOT persist any of:
`raw | html | text | from | subject | to | headers | messageId`.

The single enforcement function is `lib/sanitize.ts::sanitizeDoPayload`
which whitelists `{otp, confidence, verifyLinks, receivedAt}`. Any
other key in a payload throws. The Email handler also constructs the
payload by hand (never spreading `parsed`), and re-runs sanitisation
as defence-in-depth.

DO storage is purged automatically 10 minutes after the most recent
message via `state.storage.setAlarm()`.

## What is intentionally stubbed in M1

- `do/AliasChannel.ts::handleWebSocket` — throws `"WS hibernation — M4"`.
  Hibernation API lands in M4 alongside the Safari Web Extension SSE
  client.
- Tests live under `workers/email-router/test/` and are written by the
  Test Engineer in Stage 5. The `test` script is a no-op until then.

## TODO Tagging Convention

All TODO comments in this workspace follow:

`TODO(<severity-id>/<milestone>): <description>`

Where:

- `severity-id` is the original issue tag from Debugger/Reviewer reports
  (e.g. `HIGH-1`, `MEDIUM-2`, `IMP-3`).
- `milestone` is when the work is expected (e.g. `M4`, `M5`).
- `description` is a short explanation.

Examples:

- `TODO(HIGH-1/M4 secret rotation): invalidate cache on rotation`
- `TODO(MEDIUM-1/2/M4 SSE hardening): handle Last-Event-ID replay`

Legacy tags like `FIX-N [SEV-M]` from earlier rounds (R1/R2) are
grandfathered in-place — they document completed regression fixes and
should not be rewritten. New code MUST use the `TODO(...)` form above.
Current grandfathered locations: `src/parser/otp.ts`,
`src/parser/links.ts`, `src/email.ts`, `src/do/AliasChannel.ts`,
`src/router.ts`.
