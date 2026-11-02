import { readdir, readFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const constantsPath = resolve(root, "frontend/src/core/constants.ts");
const sourceRoots = [
  { forbidBrandedFileNames: true, path: resolve(root, "frontend/src") },
  { forbidBrandedFileNames: true, path: resolve(root, "frontend/tests") },
  {
    forbidBrandedFileNames: false,
    path: resolve(root, "custom_components/watchzone"),
  },
];

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

const brandedIdentifier =
  /\b(?:WatchZone[A-Z]\w*|watchZone[A-Z]\w*|__WATCHZONE_\w*)\b/;
const violations = [];

const constantsSource = await readFile(constantsPath, "utf8");
const appNameMatch = constantsSource.match(
  /export const APP_NAME = ["']([^"']+)["'];/,
);
if (!appNameMatch) {
  throw new Error("APP_NAME must be declared in frontend/src/core/constants.ts");
}
const appIdentity = appNameMatch[1].toLowerCase();

for (const sourceRoot of sourceRoots) {
  for (const path of await sourceFiles(sourceRoot.path)) {
    if (!/\.(?:py|ts)$/.test(path) || path.includes("__pycache__")) continue;
    if (
      brandedIdentifier.test(await readFile(path, "utf8")) ||
      (sourceRoot.forbidBrandedFileNames && /watchzone/i.test(basename(path)))
    ) {
      violations.push(relative(root, path).replaceAll("\\", "/"));
    }
  }
}

for (const path of [
  ...(await sourceFiles(resolve(root, "frontend/src"))),
  ...(await sourceFiles(resolve(root, "frontend/tests"))),
  resolve(root, "frontend/index.html"),
]) {
  if (path === constantsPath || !/\.(?:html|ts)$/.test(path)) continue;
  const contents = await readFile(path, "utf8");
  if (contents.toLowerCase().includes(appIdentity)) {
    violations.push(relative(root, path).replaceAll("\\", "/"));
  }
}

if (violations.length > 0) {
  throw new Error(
    `Brand-prefixed internal identifiers are forbidden: ${violations.join(", ")}`,
  );
}

console.log("Validated centralized application and internal identifiers.");
