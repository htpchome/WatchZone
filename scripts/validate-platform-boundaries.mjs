import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(root, "frontend/src");
const classifierOwner = "core/client-environment.ts";

const ownershipRules = [
  {
    files: /^card\//,
    forbidden: [
      /(?:from|import\()[\s(]*["'][^"']*providers\//,
      /["'][^"']*media-session-manager["']/,
      /["'][^"']*session\.controller["']/,
    ],
    reason: "card shell must not own provider or media-session behavior",
  },
  {
    files: /^modules\/camera\/(?!live\/session\.controller\.ts$)/,
    forbidden: [/(?:from|import\()[\s(]*["'][^"']*providers\//],
    reason: "only the camera session controller may use the provider resolver",
  },
  {
    files: /^modules\/camera\/live\/session\.controller\.ts$/,
    forbidden: [/(?:from|import\()[\s(]*["'][^"']*providers\/[^"']+\//],
    reason: "camera orchestration must not import a concrete provider",
  },
  {
    files: /^modules\//,
    forbidden: [/(?:from|import\()[\s(]*["'][^"']*providers\/[^"']+\//],
    reason: "feature modules must not import concrete providers",
  },
  {
    files: /^modules\/camera\/(?!live\/(?:session|audio)\.controller\.ts$)/,
    forbidden: [/["'][^"']*media-session-manager["']/],
    reason:
      "only camera session and audio controllers may access session state",
  },
  {
    files: /^modules\/camera\/(?!live\/audio\.controller\.ts$)/,
    forbidden: [/["'][^"']*media-playback["']/],
    reason: "only the camera audio controller may own playback policy",
  },
  {
    files: /^modules\/camera\/live\/presentation\.ts$/,
    forbidden: [/["'][^"']*(?:audio|session)\.controller["']/],
    reason: "camera presentation must emit media intents, not own media policy",
  },
  {
    files: /^core\//,
    forbidden: [/(?:from|import\()[\s(]*["'][^"']*providers\//],
    reason: "core must not depend on a provider adapter",
  },
  {
    files: /^providers\//,
    forbidden: [/(?:from|import\()[\s(]*["'][^"']*(?:card|editor|modules)\//],
    reason: "provider adapters must not depend on UI features",
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

const violations = [];
const ownershipViolations = [];
for (const path of await sourceFiles(sourceRoot)) {
  if (!path.endsWith(".ts")) continue;
  const source = relative(sourceRoot, path).replaceAll("\\", "/");
  if (source === classifierOwner) continue;
  const contents = await readFile(path, "utf8");
  if (
    /userAgentData|userAgent|maxTouchPoints|navigator\.platform/.test(contents)
  ) {
    violations.push(source);
  }
  for (const rule of ownershipRules) {
    if (
      rule.files.test(source) &&
      rule.forbidden.some((pattern) => pattern.test(contents))
    ) {
      ownershipViolations.push(`${source}: ${rule.reason}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(
    `Client classification escaped ${classifierOwner}: ${violations.join(", ")}`,
  );
}

if (ownershipViolations.length > 0) {
  throw new Error(
    `Feature ownership boundary violation:\n${ownershipViolations.join("\n")}`,
  );
}

console.log(
  "Validated client classification and feature ownership boundaries.",
);
