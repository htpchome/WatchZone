import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { defineConfig, type Plugin } from "vite";

import {
  expandLegacyInsetFallbacks,
  isCameraOpticsStyleModule,
} from "./build/legacy-css.js";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };
const browserBuildTargets = JSON.parse(
  readFileSync(new URL("./build-targets.json", import.meta.url), "utf8"),
) as { targets: string[] };

function legacyCssCompatibility(): Plugin {
  return {
    name: "camera-optics-legacy-css-compatibility",
    enforce: "pre",
    transform(source, id) {
      if (!isCameraOpticsStyleModule(id)) return;
      return {
        code: expandLegacyInsetFallbacks(source),
        map: null,
      };
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [legacyCssCompatibility()],
  define: {
    __APP_BUILD__: JSON.stringify(
      process.env.GITHUB_SHA?.slice(0, 7) ?? "local00",
    ),
    __APP_VERSION__: JSON.stringify(packageJson.version),
    "process.env.NODE_ENV": JSON.stringify(
      mode === "production" ? "production" : "development",
    ),
  },
  build: {
    emptyOutDir: true,
    manifest: true,
    minify: "terser",
    target: browserBuildTargets.targets,
    terserOptions: { compress: { passes: 2 } },
    outDir: resolve(import.meta.dirname, "../dist/frontend"),
    lib: {
      entry: resolve(import.meta.dirname, "src/main.ts"),
      formats: ["es"],
      fileName: "camera-optics",
    },
    rollupOptions: {
      output: {
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks(id) {
          if (id.endsWith("/src/core/browser-compatibility.ts")) {
            return "browser-compatibility";
          }
        },
      },
    },
  },
}));
