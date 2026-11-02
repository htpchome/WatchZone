import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig } from "vite";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  resolve: {
    dedupe: ["@lit/reactive-element", "lit", "lit-element", "lit-html"],
  },
  optimizeDeps: {
    include: ["lit", "lit/static-html.js"],
  },
  define: {
    __APP_BUILD__: JSON.stringify(
      process.env.GITHUB_SHA?.slice(0, 7) ?? "local",
    ),
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  build: {
    emptyOutDir: true,
    manifest: true,
    outDir: resolve(import.meta.dirname, "../dist/frontend"),
    lib: {
      entry: resolve(import.meta.dirname, "src/main.ts"),
      formats: ["es"],
      fileName: "watchzone",
    },
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
