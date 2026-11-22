import { describe, expect, it } from "vitest";

import browserBuildTargets from "../build-targets.json";

describe("production browser target", () => {
  it("matches Home Assistant's pinned legacy browser floors", () => {
    expect(browserBuildTargets.targets).toEqual([
      "chrome67",
      "edge79",
      "firefox98",
      "safari15.4",
    ]);
  });
});
