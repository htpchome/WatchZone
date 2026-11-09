import { readdir, readFile, stat } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "frontend/src");
const coreRoot = resolve(sourceRoot, "core");
const stageRoot = resolve(sourceRoot, "stage");
const modulesRoot = resolve(stageRoot, "modules");
const componentsRoot = resolve(stageRoot, "components");
const providersRoot = resolve(sourceRoot, "providers");
const obsoleteConnectionsRoot = resolve(sourceRoot, "connections");
const obsoleteOwnershipRoots = [
  resolve(sourceRoot, "modules"),
  resolve(sourceRoot, "components"),
  resolve(sourceRoot, "media"),
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

const violations = [];
const imports = /(?:from\s+|import\s*\()\s*["']([^"']+)["']/g;

for (const path of await collectTypeScript(sourceRoot)) {
  const source = await readFile(path, "utf8");
  const displayPath = relative(root, path);
  const isCore = path.startsWith(`${coreRoot}${sep}`);
  const isModule = path.startsWith(`${modulesRoot}${sep}`);
  const isComponent = path.startsWith(`${componentsRoot}${sep}`);
  const moduleName = isModule
    ? relative(modulesRoot, path).split(sep)[0]
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
    if (isModule && resolved?.startsWith(`${modulesRoot}${sep}`)) {
      const importedModule = relative(modulesRoot, resolved).split(sep)[0];
      if (importedModule !== moduleName) {
        violations.push(
          `${displayPath}: module ${moduleName} cannot import module ${importedModule}`,
        );
      }
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

console.log("Validated core, module, and provider ownership boundaries.");
