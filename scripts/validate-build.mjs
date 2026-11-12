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
const cameraCapability =
  manifest["src/editor/camera-capability.controller.ts"];
const sortableList = manifest["src/ui/sortable-list.ts"];
const camera = manifest["src/stage/modules/camera/index.ts"];
const provider = manifest["src/providers/home-assistant/live/index.ts"];
const webRtcAdapter = manifest["src/providers/home-assistant/live/webrtc.ts"];
const hlsAdapter = manifest["src/providers/home-assistant/live/hls.ts"];

if (!entry?.isEntry || entry.file !== "watchzone.js") {
  throw new Error("Vite manifest is missing the stable WatchZone entry");
}
for (const [name, asset] of Object.entries({
  editor,
  cameraCapability,
  sortableList,
  camera,
  provider,
  webRtcAdapter,
  hlsAdapter,
})) {
  if (!asset?.isDynamicEntry) {
    throw new Error(`The ${name} must remain a dynamic entry`);
  }
}

for (const asset of Object.values(manifest)) {
  await stat(resolve(frontend, asset.file));
  if (asset.file.endsWith(".js")) {
    const source = await readFile(resolve(frontend, asset.file), "utf8");
    if (/\bprocess(?:\.|\[)/u.test(source)) {
      throw new Error(
        `Browser bundle contains an unresolved Node process global: ${asset.file}`,
      );
    }
  }
}

const collectEagerGraph = (source, graph = new Set()) => {
  if (graph.has(source)) {
    return graph;
  }
  graph.add(source);
  for (const imported of manifest[source]?.imports ?? []) {
    collectEagerGraph(imported, graph);
  }
  return graph;
};

const eagerGraph = collectEagerGraph(entry.src);
for (const [name, asset] of Object.entries({
  editor,
  cameraCapability,
  sortableList,
  camera,
  provider,
  webRtcAdapter,
  hlsAdapter,
})) {
  if (eagerGraph.has(asset.src)) {
    throw new Error(`The ${name} was included in the eager import graph`);
  }
}

const eagerGzipBytes = (
  await Promise.all(
    [...eagerGraph].map(
      async (source) =>
        gzipSync(await readFile(resolve(frontend, manifest[source].file)))
          .byteLength,
    ),
  )
).reduce((total, size) => total + size, 0);
if (eagerGzipBytes > 50 * 1024) {
  throw new Error(`Eager graph exceeds 50 KiB gzip: ${eagerGzipBytes} bytes`);
}

const editorGzipBytes = gzipSync(
  await readFile(resolve(frontend, editor.file)),
).byteLength;
const editorGzipBudgetBytes = 12 * 1024;
const editorGzipSafetyMarginBytes = 256;
const editorGzipValidationLimitBytes =
  editorGzipBudgetBytes - editorGzipSafetyMarginBytes;
if (editorGzipBytes > editorGzipValidationLimitBytes) {
  throw new Error(
    `Lazy editor entry exceeds the ${editorGzipValidationLimitBytes}-byte validation limit (${editorGzipSafetyMarginBytes}-byte safety margin below the 12 KiB release budget): ${editorGzipBytes} bytes`,
  );
}

console.log(
  `Validated lazy editor (${editorGzipBytes} bytes gzip), sortable list, camera module, provider, and WebRTC/HLS adapters; eager graph is ${eagerGzipBytes} bytes gzip.`,
);
