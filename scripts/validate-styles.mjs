import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "frontend/src");
const themeBoundary = resolve(sourceRoot, "styles/theme-tokens.ts");

async function collectTypeScript(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await collectTypeScript(path, files);
    } else if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

const violations = [];

for (const path of await collectTypeScript(sourceRoot)) {
  const source = await readFile(path, "utf8");
  const relativePath = path.slice(root.length + 1);
  const isStyleFile = basename(path).endsWith(".styles.ts");
  const isThemeBoundary = path === themeBoundary;

  if (!isStyleFile && !isThemeBoundary && /\bcss\s*`/.test(source)) {
    violations.push(`${relativePath}: embedded Lit CSS is prohibited`);
  }
  if (!isThemeBoundary) {
    const nonWatchZoneVariables = [
      ...source.matchAll(/var\(\s*(--[a-z0-9-]+)/gi),
    ]
      .map((match) => match[1])
      .filter((name) => !name.startsWith("--wzc-"));
    if (source.includes("--ha-") || nonWatchZoneVariables.length > 0) {
      violations.push(
        `${relativePath}: component CSS may reference only --wzc-* variables; found ${[
          ...new Set(nonWatchZoneVariables),
        ].join(", ") || "a direct --ha-* token"}`,
      );
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Style contract violations:\n${violations.join("\n")}`);
}

console.log(
  "Validated colocated style files and the centralized WatchZone theme-token boundary.",
);
