import { defineConfig } from "vite";
import { resolve } from "node:path";

// Content script build: IIFE format (no ES module imports).
//
// Content scripts are injected by Safari as classic <script> — not
// type="module". Any `import` statement causes SyntaxError and the
// entire content script silently fails. Bundling as IIFE with
// inlineDynamicImports ensures a single self-contained file.
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
    emptyOutDir: false, // preserve background.js + popup from prior builds
    sourcemap: process.env["NODE_ENV"] !== "production",
    rollupOptions: {
      input: resolve(__dirname, "src/content/index.ts"),
      output: {
        format: "iife",
        entryFileNames: "content.js",
        inlineDynamicImports: true,
      },
    },
  },
});
