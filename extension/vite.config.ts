import { defineConfig } from "vite";
import { resolve } from "node:path";

// Safari Web Extension build — emits separate bundles for content / background / popup.
// The Xcode "Safari Extension App" wrapper picks up dist/ as the extension resource bundle.
export default defineConfig({
  // base: '' makes all asset paths relative — required for Safari/Chrome extensions
  // where pages are served from extension:// or safari-extension:// URLs.
  base: "",
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
        popup: resolve(__dirname, "src/popup/index.html"),
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
