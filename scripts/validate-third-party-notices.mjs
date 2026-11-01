import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const packageJsonPath = path.join(repositoryRoot, "frontend", "package.json");
const noticesPath = path.join(repositoryRoot, "THIRD_PARTY_NOTICES.md");

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const notices = await readFile(noticesPath, "utf8");
const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});
const missingNotices = runtimeDependencies.filter(
  (dependency) => !notices.includes(`## ${dependency} —`),
);

if (missingNotices.length > 0) {
  throw new Error(
    `Missing third-party notices for runtime dependencies: ${missingNotices.join(", ")}`,
  );
}

console.log(
  `Validated third-party notices for ${runtimeDependencies.length} runtime dependencies.`,
);
