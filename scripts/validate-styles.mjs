import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "frontend/src");
const themeBoundary = resolve(sourceRoot, "styles/theme-tokens.ts");
const homeAssistantCardBridge = resolve(
  sourceRoot,
  "styles/home-assistant-card-bridge.ts",
);
const homeAssistantEditorBridge = resolve(
  sourceRoot,
  "editor/home-assistant-editor-bridge.ts",
);
const allowedHomeAssistantTokens = new Map([
  [homeAssistantEditorBridge, new Set(["--ha-view-sections-column-max-width"])],
]);

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
  const isStyleBoundary =
    path === themeBoundary || path === homeAssistantCardBridge;

  if (!isStyleFile && path !== themeBoundary && /\bcss\s*`/.test(source)) {
    violations.push(`${relativePath}: embedded Lit CSS is prohibited`);
  }
  if (!isStyleBoundary) {
    const nonWatchZoneVariables = [
      ...source.matchAll(/var\(\s*(--[a-z0-9-]+)/gi),
    ]
      .map((match) => match[1])
      .filter((name) => !name.startsWith("--wzc-"));
    const unexpectedHomeAssistantTokens = [
      ...source.matchAll(/--ha-[a-z0-9-]+/gi),
    ]
      .map((match) => match[0])
      .filter((name) => !allowedHomeAssistantTokens.get(path)?.has(name));
    if (
      unexpectedHomeAssistantTokens.length > 0 ||
      nonWatchZoneVariables.length > 0
    ) {
      violations.push(
        `${relativePath}: component CSS may reference only --wzc-* variables; found ${[
          ...new Set(nonWatchZoneVariables),
          ...new Set(unexpectedHomeAssistantTokens),
        ].join(", ")}`,
      );
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Style contract violations:\n${violations.join("\n")}`);
}

console.log(
  "Validated colocated styles, WatchZone theme tokens, and isolated Home Assistant bridges.",
);
