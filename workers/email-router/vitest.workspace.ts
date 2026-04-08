import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";
import { defineProject } from "vitest/config";

/**
 * Workspace definition for vitest 2.1+. Each entry is a separate vitest
 * project with its own transformer/runtime.
 *
 *   - "unit"        — pure functions (parsers, sanitize, jwt, alias).
 *                     Runs in the default node environment.
 *   - "integration" — Worker + Durable Object behaviour. Uses
 *                     `@cloudflare/vitest-pool-workers` (Miniflare 3) so we
 *                     get real DO storage, alarms, KV, and the email handler
 *                     under the same isolate the Worker would run in.
 */
export default [
  defineProject({
    test: {
      name: "unit",
      environment: "node",
      include: ["test/unit/**/*.test.ts"],
      globals: false,
    },
  }),

  defineWorkersProject({
    test: {
      name: "integration",
      include: ["test/integration/**/*.test.ts"],
      poolOptions: {
        workers: {
          singleWorker: true,
          // sqlite-backed DOs (new_sqlite_classes, required for free plan)
          // + isolatedStorage:true trips an internal "Expected .sqlite"
          // assertion in vitest-pool-workers 0.5.5. Disable isolation; the
          // integration tests are run in a single isolate and clean up via
          // DELETE / handler / DO alarm sweeps already.
          isolatedStorage: false,
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
];
