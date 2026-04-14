import { defineConfig } from "vite";
import { resolve } from "node:path";

// Background script build: IIFE format.
//
// iOS Safari Web Extension uses event pages (background.scripts), not
// service workers (background.service_worker). Event page scripts are
// loaded as classic <script> — same as content scripts. IIFE ensures
// no ES module syntax that would cause SyntaxError.
export default defineConfig({
  base: "",
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  define: {
    __SHIELDMAIL_DEV__:
      process.env["NODE_ENV"] === "production" ? "false" : "true",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: process.env["NODE_ENV"] !== "production",
    rollupOptions: {
      input: resolve(__dirname, "src/background/index.ts"),
      output: {
        format: "iife",
        entryFileNames: "background.js",
        inlineDynamicImports: true,
      },
    },
  },
});
