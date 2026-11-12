import { readdir, readFile, stat } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "frontend/src");
const apiRoot = resolve(sourceRoot, "api");
const coreRoot = resolve(sourceRoot, "core");
const featuresRoot = resolve(sourceRoot, "features");
const stageRoot = resolve(sourceRoot, "stage");
const modulesRoot = resolve(stageRoot, "modules");
const componentsRoot = resolve(stageRoot, "components");
const providersRoot = resolve(sourceRoot, "providers");
const uiRoot = resolve(sourceRoot, "ui");
const obsoleteConnectionsRoot = resolve(sourceRoot, "connections");
const obsoleteOwnershipRoots = [
  resolve(sourceRoot, "modules"),
  resolve(sourceRoot, "components"),
  resolve(sourceRoot, "media"),
];
const backendBoundaryRoots = [
  resolve(root, "custom_components/watchzone/api"),
  resolve(root, "custom_components/watchzone/features"),
];
const publicProviderResolvers = new Set([
  "activity-update-resolver",
  "live-source-resolver",
  "ptz-source-resolver",
  "talk-source-resolver",
]);

async function collectTypeScript(directory, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collectTypeScript(path, files);
    else if (entry.name.endsWith(".ts")) files.push(path);
  }
  return files;
}

async function collectFiles(directory, suffix, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collectFiles(path, suffix, files);
    else if (entry.name.endsWith(suffix)) files.push(path);
  }
  return files;
}

const violations = [];
const imports = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g;

for (const path of await collectTypeScript(sourceRoot)) {
  const source = await readFile(path, "utf8");
  const displayPath = relative(root, path);
  const isCore = path.startsWith(`${coreRoot}${sep}`);
  const isFeature = path.startsWith(`${featuresRoot}${sep}`);
  const isUi = path.startsWith(`${uiRoot}${sep}`);
  const isModule = path.startsWith(`${modulesRoot}${sep}`);
  const isComponent = path.startsWith(`${componentsRoot}${sep}`);
  const moduleName = isModule
    ? relative(modulesRoot, path).split(sep)[0]
    : undefined;
  const featureName = isFeature
    ? relative(featuresRoot, path).split(sep)[0]
    : undefined;
  const componentName = isComponent
    ? relative(componentsRoot, path).split(sep)[0]
    : undefined;

  for (const match of source.matchAll(imports)) {
    const specifier = match[1];
    const resolved = specifier.startsWith(".")
      ? resolve(path, "..", specifier)
      : undefined;
    if (
      isCore &&
      resolved &&
      (resolved.startsWith(stageRoot) || resolved.startsWith(providersRoot))
    ) {
      violations.push(`${displayPath}: core cannot import stage or providers`);
    }
    if (
      isUi &&
      resolved &&
      (resolved.startsWith(`${apiRoot}${sep}`) ||
        resolved.startsWith(`${featuresRoot}${sep}`) ||
        resolved.startsWith(`${providersRoot}${sep}`) ||
        resolved.startsWith(`${stageRoot}${sep}`))
    ) {
      violations.push(
        `${displayPath}: UI primitives cannot import API, feature, provider, or Stage ownership`,
      );
    }
    if (isModule && resolved?.startsWith(`${modulesRoot}${sep}`)) {
      const importedModule = relative(modulesRoot, resolved).split(sep)[0];
      if (importedModule !== moduleName) {
        violations.push(
          `${displayPath}: module ${moduleName} cannot import module ${importedModule}`,
        );
      }
    }
    if (isFeature && resolved?.startsWith(`${featuresRoot}${sep}`)) {
      const importedFeature = relative(featuresRoot, resolved).split(sep)[0];
      if (importedFeature !== featureName) {
        violations.push(
          `${displayPath}: feature ${featureName} cannot import feature ${importedFeature}`,
        );
      }
    }
    if (!isFeature && resolved?.startsWith(`${featuresRoot}${sep}`)) {
      const [importedFeature, privatePath] = relative(
        featuresRoot,
        resolved,
      ).split(sep);
      if (privatePath) {
        violations.push(
          `${displayPath}: feature ${importedFeature} must be imported through its public entry point`,
        );
      }
    }
    if (
      isFeature &&
      resolved &&
      (resolved.startsWith(`${modulesRoot}${sep}`) ||
        resolved.startsWith(`${componentsRoot}${sep}`))
    ) {
      violations.push(
        `${displayPath}: application features cannot import Stage placeable implementations`,
      );
    }
    if (isComponent && resolved?.startsWith(`${componentsRoot}${sep}`)) {
      const importedComponent = relative(componentsRoot, resolved).split(
        sep,
      )[0];
      if (importedComponent !== componentName) {
        violations.push(
          `${displayPath}: component ${componentName} cannot import component ${importedComponent}`,
        );
      }
    }
    if (
      (isModule && resolved?.startsWith(`${componentsRoot}${sep}`)) ||
      (isComponent && resolved?.startsWith(`${modulesRoot}${sep}`))
    ) {
      violations.push(
        `${displayPath}: modules and components communicate through core contracts`,
      );
    }
    if (
      (isModule || isComponent) &&
      resolved?.startsWith(`${providersRoot}${sep}`) &&
      !publicProviderResolvers.has(basename(resolved))
    ) {
      violations.push(
        `${displayPath}: placeables must use a public provider resolver`,
      );
    }
  }

  if (isUi && /\bopenRecordedMedia\s*\(/.test(source)) {
    violations.push(
      `${displayPath}: UI primitives emit typed intents and cannot open application media workflows`,
    );
  }
  if (isUi && /\bHomeAssistantApi\b/.test(source)) {
    violations.push(
      `${displayPath}: UI primitives accept narrow presentation inputs, not the Home Assistant API`,
    );
  }
  if (
    path === resolve(stageRoot, "layout-runtime.ts") &&
    /(?:from\s+["'][^"']*\/modules\/|\b(?:REVIEWS|EVENTS|RECORDINGS|EXPORTS)_MODULE_TYPE\b)/.test(
      source,
    )
  ) {
    violations.push(
      `${displayPath}: the generic layout runtime cannot depend on built-in module identities`,
    );
  }
  if (
    (path === resolve(stageRoot, "activity/activity-filter.ts") ||
      path === resolve(stageRoot, "activity/activity-calendar.ts")) &&
    /from\s+["'][^"']*\/api\/(?:reviews|events|recordings|exports)["']/.test(
      source,
    )
  ) {
    violations.push(
      `${displayPath}: shared activity controls consume published context and cannot load module data`,
    );
  }
}

for (const ownershipRoot of [modulesRoot, componentsRoot]) {
  for (const path of await collectTypeScript(ownershipRoot)) {
    if (basename(path) !== "index.ts") continue;
    const source = await readFile(path, "utf8");
    if (!/\bcontextKeys\s*:/.test(source)) {
      violations.push(
        `${relative(root, path)}: placeable definitions must declare finite contextKeys`,
      );
    }
  }
}

for (const boundaryRoot of backendBoundaryRoots) {
  for (const path of await collectFiles(boundaryRoot, ".py")) {
    const source = await readFile(path, "utf8");
    if (/providers(?:\.|\/)(?:frigate|home_assistant)\b/.test(source)) {
      violations.push(
        `${relative(root, path)}: backend API and features cannot import concrete providers`,
      );
    }
  }
}

try {
  if ((await stat(obsoleteConnectionsRoot)).isDirectory()) {
    violations.push(
      "frontend/src/connections: obsolete ownership root must not be retained",
    );
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

for (const obsoleteRoot of obsoleteOwnershipRoots) {
  try {
    if ((await stat(obsoleteRoot)).isDirectory()) {
      violations.push(
        `${relative(root, obsoleteRoot)}: obsolete ownership root must not be retained`,
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

if (violations.length > 0) {
  throw new Error(
    `Architecture contract violations:\n${violations.join("\n")}`,
  );
}

console.log(
  "Validated frontend and backend ownership, placeable context, and provider boundaries.",
);
