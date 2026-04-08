import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

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

export default defineConfig({
  // base: '' makes all asset paths relative — required for Safari/Chrome extensions
  // where pages are served from extension:// or safari-extension:// URLs.
  base: "",
  plugins: [stripCrossorigin],
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
        content: resolve(__dirname, "src/content/index.ts"),
        background: resolve(__dirname, "src/background/index.ts"),
        // popup is built separately by vite.popup.config.ts as IIFE format.
        // iOS Safari Web Extension popups break on <script type="module">
        // with sibling chunks — see ARCHITECTURE.md and vite.popup.config.ts.
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
