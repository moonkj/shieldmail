import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

// IIFE script is a classic <script>, not a module. Strip type="module"
// and crossorigin from injected tags, drop modulepreload links, AND add
// defer so the script waits for DOM parsing (Vite injects scripts into
// <head> by default; classic scripts there run before body, so
// document.getElementById("root") returns null and render is skipped).
const popupHtmlFix: Plugin = {
  name: "shieldmail:popup-html-fix",
  enforce: "post",
  transformIndexHtml(html) {
    return html
      .replace(/\stype="module"/g, "")
      .replace(/\s+crossorigin(=("[^"]*"|'[^']*'))?/g, "")
      .replace(/<link\s+rel="modulepreload"[^>]*>\s*/g, "")
      // Add defer to all <script src=...> that don't already have it.
      .replace(/<script\s+src=/g, "<script defer src=");
  },
};

// Popup-only build: IIFE format so no <script type="module"> required.
// iOS Safari Web Extension popup context refuses to load module scripts;
// IIFE produces a single self-contained classic script that just works.
export default defineConfig({
  base: "",
  plugins: [popupHtmlFix],
  esbuild: {
    jsx: "automatic",
    jsxImportSource: "preact",
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: false, // preserve content.js / background.js from main build
    sourcemap: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, "popup.html"),
      output: {
        format: "iife",
        entryFileNames: "popup.js",
        assetFileNames: (asset) => {
          if (asset.name?.endsWith(".html")) return "[name][extname]";
          if (asset.name?.endsWith(".css")) return "popup.css";
          return "assets/[name]-[hash][extname]";
        },
        inlineDynamicImports: true,
      },
    },
  },
});
