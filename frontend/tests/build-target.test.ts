import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import browserBuildTargets from "../build-targets.json";
import {
  expandLegacyInsetFallbacks,
  isCameraOpticsStyleModule,
} from "../build/legacy-css";

describe("production browser target", () => {
  it("matches Home Assistant's pinned legacy browser floors", () => {
    expect(browserBuildTargets.targets).toEqual([
      "chrome67",
      "edge79",
      "firefox98",
      "safari15.4",
    ]);
  });

  it("installs browser compatibility before loading the application", () => {
    const entry = readFileSync(resolve("src/main.ts"), "utf8");
    expect(entry.indexOf('import "./core/browser-compatibility"')).toBe(0);
    expect(entry).toContain('export { DashboardCard } from "./application"');
  });
});

describe("legacy CSS positioning", () => {
  it("adds physical fallbacks without removing modern inset declarations", () => {
    expect(
      expandLegacyInsetFallbacks(`const styles = css\`
  .fill {
    inset: 1px 2px 3px 4px;
    inset-inline: max(1px, var(--safe)) 2rem;
    inset-block-end: 0;
  }
\`;`),
    ).toContain(`top: 1px;
    right: 2px;
    bottom: 3px;
    left: 4px;
    inset: 1px 2px 3px 4px;`);
    expect(
      expandLegacyInsetFallbacks(
        `.fill {\n  inset-inline: max(1px, var(--safe)) 2rem;\n}`,
      ),
    ).toContain(`left: max(1px, var(--safe));
  right: 2rem;
  inset-inline: max(1px, var(--safe)) 2rem;`);
    expect(
      expandLegacyInsetFallbacks(`.fill {\n  inset-block-end: 0;\n}`),
    ).toContain(`bottom: 0;\n  inset-block-end: 0;`);
  });

  it("recognizes only colocated style modules", () => {
    expect(isCameraOpticsStyleModule("/src/card/card.styles.ts")).toBe(true);
    expect(isCameraOpticsStyleModule("/src/card/card.ts")).toBe(false);
  });
});
