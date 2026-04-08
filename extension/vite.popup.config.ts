import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

// IIFE script is a classic <script>, not a module. Strip type="module"
// and crossorigin from injected tags, drop modulepreload links.
const popupHtmlFix: Plugin = {
  name: "shieldmail:popup-html-fix",
  enforce: "post",
  transformIndexHtml(html) {
    return html
      .replace(/\stype="module"/g, "")
      .replace(/\s+crossorigin(=("[^"]*"|'[^']*'))?/g, "")
      .replace(/<link\s+rel="modulepreload"[^>]*>\s*/g, "");
  },
};

// Popup-only build: IIFE format so no <script type="module"> required.
// iOS Safari Web Extension popup context refuses to load module scripts;
// IIFE produces a single self-contained classic script that just works.
export default defineConfig({
  base: "",
  plugins: [popupHtmlFix],
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
