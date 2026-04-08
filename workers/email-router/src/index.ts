/**
 * ShieldMail Email Router Worker.
 *
 * Single Worker that exposes:
 *   - HTTP API (Hono router)            → see src/router.ts
 *   - Email Routing handler             → see src/email.ts
 *   - AliasChannel Durable Object       → see src/do/AliasChannel.ts
 *   - TokenBucket  Durable Object       → see src/do/TokenBucket.ts
 *
 * Per ARCHITECTURE.md §3 these are co-located in one Worker for M1.
 */

import { buildRouter } from "./router.js";
import { handleEmail } from "./email.js";
import type { Env } from "./types/env.js";

export { AliasChannel } from "./do/AliasChannel.js";
export { TokenBucket } from "./do/TokenBucket.js";

const app = buildRouter();

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
    return app.fetch(request, env, ctx);
  },

  async email(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<void> {
    await handleEmail(message, env, ctx);
  },
};
