import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
import { defineConfig } from "vitest/config";

/**
 * ShieldMail email-router test suite.
 *
 * Two projects:
 *   - "unit"        — pure functions (parsers, sanitize, jwt, alias).
 *                     Runs in a node environment, no Workers runtime.
 *   - "integration" — Worker + Durable Object behaviour. Uses
 *                     `@cloudflare/vitest-pool-workers` (Miniflare 3) so we
 *                     get real DO storage, alarms, KV, and the email handler
 *                     under the same isolate the Worker would run in.
 *
 * Configured as a workspace via `projects` so a single `vitest run` runs both.
 *
 * NOTE: Do NOT run `npm install` — devDeps are declared in package.json but
 * the Test Engineer is forbidden from installing modules. The CI step is
 * expected to install before invoking `npm test`.
 */
export default defineConfig({
  test: {
    projects: [
      // ──────────────────────────────────────────
      // UNIT (node) — pure functions only
      // ──────────────────────────────────────────
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["test/unit/**/*.test.ts"],
          globals: false,
          // Pure-fn unit tests must never reach the network or filesystem
          // beyond the fixtures dir. Vitest's default sandboxing is enough.
        },
        resolve: {
          // src files use ".js" extensions in TS imports (NodeNext); the
          // unit tests import the .ts source directly via the same path.
          // Vitest+esbuild handles the rewrite automatically.
        },
      },

      // ──────────────────────────────────────────
      // INTEGRATION (workers pool) — DO + handlers
      // ──────────────────────────────────────────
      // Loads bindings from wrangler.toml so the test runtime mirrors what
      // the Worker actually ships with. The KV namespace ID and DO bindings
      // are simulated by Miniflare; HMAC_KEY is overridden to a known value
      // so the JWT round-trip in tests is deterministic.
      defineWorkersProject({
        test: {
          name: "integration",
          include: ["test/integration/**/*.test.ts"],
          poolOptions: {
            workers: {
              singleWorker: true,
              isolatedStorage: true,
              wrangler: { configPath: "./wrangler.toml" },
              miniflare: {
                bindings: {
                  HMAC_KEY: "test-hmac-key-do-not-use-in-prod",
                  DOMAIN_POOL: "d1.test.shld.me,d2.test.shld.me",
                },
              },
            },
          },
        },
      }),
    ],
  },
});
