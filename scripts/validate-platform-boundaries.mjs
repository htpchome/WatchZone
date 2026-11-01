import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "frontend/src");
const allowedCatalystOwners = new Set([
  "connections/home-assistant/catalyst-hls.ts",
  "connections/home-assistant/resolver.ts",
  "core/client-environment.ts",
  "core/global.d.ts",
  "core/media-session-manager.ts",
  "main.ts",
]);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : [path];
    }),
  );
  return files.flat();
}

const violations = [];
for (const path of await sourceFiles(sourceRoot)) {
  if (!path.endsWith(".ts")) continue;
  const source = relative(sourceRoot, path).replaceAll("\\", "/");
  if (
    allowedCatalystOwners.has(source) ||
    source.startsWith("platform/catalyst/")
  ) {
    continue;
  }
  if (/catalyst/i.test(await readFile(path, "utf8"))) violations.push(source);
}

if (violations.length > 0) {
  throw new Error(
    `Catalyst policy escaped its detection/composition/adapter boundary: ${violations.join(", ")}`,
  );
}

console.log("Validated Catalyst host-runtime source boundaries.");
