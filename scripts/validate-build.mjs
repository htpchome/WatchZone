import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = resolve(import.meta.dirname, "..");
const frontend = resolve(root, "dist/frontend");
const manifest = JSON.parse(
  await readFile(resolve(frontend, ".vite/manifest.json"), "utf8"),
);
const entry = manifest["src/main.ts"];
const editor = manifest["src/editor/watchzone-card-editor.ts"];

if (!entry?.isEntry || entry.file !== "watchzone.js") {
  throw new Error("Vite manifest is missing the stable WatchZone entry");
}
if (!editor?.isDynamicEntry || !entry.dynamicImports?.includes(editor.src)) {
  throw new Error("The card editor must remain a dynamic entry");
}
if (entry.imports?.includes(editor.src)) {
  throw new Error("The card editor was included in the eager import graph");
}

for (const asset of Object.values(manifest)) {
  await stat(resolve(frontend, asset.file));
}

const entrySource = await readFile(resolve(frontend, entry.file));
const entryGzipBytes = gzipSync(entrySource).byteLength;
if (entryGzipBytes > 50 * 1024) {
  throw new Error(`Eager entry exceeds 50 KiB gzip: ${entryGzipBytes} bytes`);
}

console.log(
  `Validated lazy editor and eager entry (${entryGzipBytes} bytes gzip).`,
);
