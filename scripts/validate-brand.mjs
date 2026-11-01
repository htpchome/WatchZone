import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const assets = [
  ["icon.png", 256],
  ["icon@2x.png", 512],
];
const pngSignature = "89504e470d0a1a0a";

for (const [name, expectedSize] of assets) {
  const path = resolve(root, "custom_components/watchzone/brand", name);
  const image = await readFile(path);
  if (image.subarray(0, 8).toString("hex") !== pngSignature) {
    throw new Error(`${name} is not a PNG image`);
  }
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width !== expectedSize || height !== expectedSize) {
    throw new Error(
      `${name} must be ${expectedSize}x${expectedSize}, got ${width}x${height}`,
    );
  }
}

console.log("Validated WatchZone brand icons (256px and 512px).");
