import { readFileSync } from "node:fs";

import { defineConfig } from "vitest/config";

const packageJson = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };

export default defineConfig({
  define: {
    __WATCHZONE_BUILD__: JSON.stringify("test"),
    __WATCHZONE_VERSION__: JSON.stringify(packageJson.version),
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts"],
  },
});
