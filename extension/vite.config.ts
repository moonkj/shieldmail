import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";
import { cpSync, existsSync } from "node:fs";

// Safari Web Extension build — emits separate bundles for content / background / popup.
// The Xcode "Safari Extension App" wrapper picks up dist/ as the extension resource bundle.

// iOS Safari Web Extension blocks <script type="module" crossorigin> in popup
// context (popup renders blank). Strip crossorigin from injected tags.
// modulepreload links also use crossorigin and trigger the same issue — drop them.
const stripCrossorigin: Plugin = {
  name: "shieldmail:strip-crossorigin",
  enforce: "post",
  transformIndexHtml(html) {
    return html
      .replace(/\s+crossorigin(=("[^"]*"|'[^']*'))?/g, "")
      .replace(/<link\s+rel="modulepreload"[^>]*>\s*/g, "");
  },
};

// Copy dev-only diagnostic files (diag-*, real-popup-*) only when
// NODE_ENV !== "production". Production builds omit them entirely.
const devPublicCopy: Plugin = {
  name: "shieldmail:dev-public-copy",
  apply: "build",
  closeBundle() {
    if (process.env["NODE_ENV"] === "production") return;
    const src = resolve(__dirname, "dev-public");
    const dst = resolve(__dirname, "dist");
    if (existsSync(src)) {
      cpSync(src, dst, { recursive: true });
    }
  },
};

export default defineConfig({
  // base: '' makes all asset paths relative — required for Safari/Chrome extensions
  // where pages are served from extension:// or safari-extension:// URLs.
  base: "",
  plugins: [stripCrossorigin, devPublicCopy],
  // JSX → Preact's h() instead of React.createElement().
  // Without this, Vite's default esbuild config emits React.createElement()
  // calls and the popup throws "Can't find variable: React" at runtime.
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  define: {
    // Build-time flag: true in dev builds only. Used to gate the demo
    // fallback alias-generation path so production builds never synthesize
    // fake aliases (which would mask real Worker outages).
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
    emptyOutDir: true,
    sourcemap: process.env["NODE_ENV"] !== "production",
    rollupOptions: {
      input: {
        // background service worker: manifest declares "type": "module",
        // so ES module format is correct here.
        background: resolve(__dirname, "src/background/index.ts"),
        // popup: built separately by vite.popup.config.ts (IIFE).
        // content: built separately by vite.content.config.ts (IIFE).
        // Content scripts are injected as classic scripts — ES module
        // import statements cause SyntaxError. See vite.content.config.ts.
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
        assetFileNames: (asset) => {
          if (asset.name?.endsWith(".html")) return "[name][extname]";
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: ["./test/setup.ts"],
  },
});
