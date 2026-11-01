import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "frontend/src");
const classifierOwner = "core/client-environment.ts";

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
  if (source === classifierOwner) continue;
  const contents = await readFile(path, "utf8");
  if (/userAgentData|userAgent|maxTouchPoints|navigator\.platform/.test(contents)) {
    violations.push(source);
  }
}

if (violations.length > 0) {
  throw new Error(
    `Client classification escaped ${classifierOwner}: ${violations.join(", ")}`,
  );
}

console.log("Validated single-owner client classification boundary.");
