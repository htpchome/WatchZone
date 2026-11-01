import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "frontend/src");
const allowedCatalystOwners = new Set([
  "connections/home-assistant/catalyst-hls.ts",
  "connections/home-assistant/catalyst-presentation.ts",
  "connections/home-assistant/presentation.ts",
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
const catalystPlaybackOwners = [];
for (const path of await sourceFiles(sourceRoot)) {
  if (!path.endsWith(".ts")) continue;
  const source = relative(sourceRoot, path).replaceAll("\\", "/");
  const contents = await readFile(path, "utf8");
  if (/catalyst/i.test(contents) && /\.play\s*\(/.test(contents)) {
    catalystPlaybackOwners.push(source);
  }
  if (
    allowedCatalystOwners.has(source) ||
    source.startsWith("platform/catalyst/")
  ) {
    continue;
  }
  if (/catalyst/i.test(contents)) violations.push(source);
}

if (violations.length > 0) {
  throw new Error(
    `Catalyst policy escaped its detection/composition/adapter boundary: ${violations.join(", ")}`,
  );
}

if (
  catalystPlaybackOwners.length !== 1 ||
  catalystPlaybackOwners[0] !== "connections/home-assistant/catalyst-hls.ts"
) {
  throw new Error(
    `Catalyst playback must have exactly one implementation owner: ${catalystPlaybackOwners.join(", ")}`,
  );
}

console.log(
  "Validated Catalyst host-runtime boundaries and single playback owner.",
);
