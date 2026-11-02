import { readdir, readFile, stat } from "node:fs/promises";
import { basename, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "frontend/src");
const coreRoot = resolve(sourceRoot, "core");
const modulesRoot = resolve(sourceRoot, "modules");
const providersRoot = resolve(sourceRoot, "providers");
const obsoleteConnectionsRoot = resolve(sourceRoot, "connections");

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
  const moduleName = isModule
    ? relative(modulesRoot, path).split(sep)[0]
    : undefined;

  for (const match of source.matchAll(imports)) {
    const specifier = match[1];
    const resolved = specifier.startsWith(".")
      ? resolve(path, "..", specifier)
      : undefined;
    if (
      isCore &&
      resolved &&
      (resolved.startsWith(modulesRoot) || resolved.startsWith(providersRoot))
    ) {
      violations.push(
        `${displayPath}: core cannot import modules or providers`,
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
    if (
      isModule &&
      resolved?.startsWith(`${providersRoot}${sep}`) &&
      basename(resolved) !== "live-source-resolver"
    ) {
      violations.push(
        `${displayPath}: modules must use a public provider resolver`,
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

if (violations.length > 0) {
  throw new Error(
    `Architecture contract violations:\n${violations.join("\n")}`,
  );
}

console.log("Validated core, module, and provider ownership boundaries.");
