import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "frontend/src");
const themeBoundary = resolve(sourceRoot, "styles/theme-tokens.ts");
const homeAssistantCardHostAppearance = resolve(
  sourceRoot,
  "styles/card-host-appearance.controller.ts",
);
const homeAssistantEditorBridge = resolve(
  sourceRoot,
  "editor/home-assistant-editor-bridge.ts",
);
const fullscreenCameraStyles = resolve(
  sourceRoot,
  "stage/camera-presentation/live-view.styles.ts",
);
const recordedVideoTransportStyles = resolve(
  sourceRoot,
  "features/media-viewer/transport-controls.styles.ts",
);
const recordedMediaBottomDrawerStyles = resolve(
  sourceRoot,
  "features/media-viewer/bottom-drawer/bottom-drawer.styles.ts",
);
const allowedHomeAssistantTokens = new Map([
  [homeAssistantEditorBridge, new Set(["--ha-view-sections-column-max-width"])],
]);
const motionBoundary = resolve(sourceRoot, "ui/motion/index.ts");
const motionValueBoundary = resolve(sourceRoot, "ui/motion/value.ts");

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
    path === themeBoundary || path === homeAssistantCardHostAppearance;

  const normalizedQueries = source.replace(
    /\$\{responsiveWidths\.(compact|narrow|medium|wide)\}/g,
    "RESPONSIVE_WIDTH",
  );
  for (const match of normalizedQueries.matchAll(
    /@(media|container)\s*([^{}]*)\{/g,
  )) {
    const condition = match[2];
    const hasWidthCondition =
      /\b(?:min|max)-width\s*:/.test(condition) ||
      /\bwidth\s*[<>=]/.test(condition);
    if (hasWidthCondition && !condition.includes("RESPONSIVE_WIDTH")) {
      violations.push(
        `${relativePath}: responsive width queries must use responsiveWidths`,
      );
    }
  }

  if (!isStyleFile && path !== themeBoundary && /\bcss\s*`/.test(source)) {
    violations.push(`${relativePath}: embedded Lit CSS is prohibited`);
  }
  if (
    isStyleFile &&
    /\b(?:transition|animation)(?:-[a-z-]+)?\s*:|@keyframes\b/.test(source)
  ) {
    violations.push(
      `${relativePath}: CSS animation is prohibited; use the shared Motion boundary`,
    );
  }
  if (
    path !== motionBoundary &&
    path !== motionValueBoundary &&
    /\.animate\s*\(/.test(source)
  ) {
    violations.push(
      `${relativePath}: direct animation calls are prohibited; use the shared Motion boundary`,
    );
  }
  if (
    path !== motionBoundary &&
    path !== motionValueBoundary &&
    /from\s+["']motion(?:\/mini)?["']/.test(source)
  ) {
    violations.push(
      `${relativePath}: Motion imports are restricted to the shared Motion boundary`,
    );
  }
  if (/behavior\s*:\s*["']smooth["']/.test(source)) {
    violations.push(
      `${relativePath}: browser smooth scrolling is prohibited; use the shared Motion boundary`,
    );
  }
  if (!isStyleBoundary) {
    const nonCameraOpticsVariables = [
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
      nonCameraOpticsVariables.length > 0
    ) {
      violations.push(
        `${relativePath}: component CSS may reference only --wzc-* variables; found ${[
          ...new Set(nonCameraOpticsVariables),
          ...new Set(unexpectedHomeAssistantTokens),
        ].join(", ")}`,
      );
    }
  }
  const safeAreaAllowed =
    path === themeBoundary ||
    path === fullscreenCameraStyles ||
    path === recordedVideoTransportStyles ||
    path === recordedMediaBottomDrawerStyles ||
    relativePath === "frontend/src/ui/media-overlay/controls.styles.ts";
  if (source.includes("env(safe-area-inset-") && !safeAreaAllowed) {
    violations.push(
      `${relativePath}: safe-area insets are restricted to explicit viewport/fullscreen boundaries`,
    );
  }
}

if (violations.length > 0) {
  throw new Error(`Style contract violations:\n${violations.join("\n")}`);
}

console.log(
  "Validated colocated styles, semantic tokens, Motion ownership, safe-area ownership, and isolated Home Assistant bridges.",
);
