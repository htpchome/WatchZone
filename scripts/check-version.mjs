import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const constantsPath = resolve(
  repositoryRoot,
  "custom_components/watchzone/const.py",
);
const frontendPackagePath = resolve(repositoryRoot, "frontend/package.json");
const manifestPath = resolve(
  repositoryRoot,
  "custom_components/watchzone/manifest.json",
);

const constants = await readFile(constantsPath, "utf8");
const versionMatch = constants.match(/^VERSION = "([^"]+)"$/m);

if (!versionMatch) {
  throw new Error(`VERSION is missing from ${constantsPath}`);
}

const version = versionMatch[1];
const semanticVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

if (!semanticVersionPattern.test(version)) {
  throw new Error(`VERSION is not valid Semantic Versioning: ${version}`);
}

const frontendPackage = JSON.parse(await readFile(frontendPackagePath, "utf8"));

if (frontendPackage.version !== version) {
  throw new Error(
    `Version mismatch: const.py=${version}, frontend/package.json=${frontendPackage.version}`,
  );
}

try {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== version) {
    throw new Error(
      `Version mismatch: const.py=${version}, manifest.json=${manifest.version}`,
    );
  }
} catch (error) {
  if (error?.code !== "ENOENT") {
    throw error;
  }
}

console.log(`WatchZone version ${version} is consistent.`);
