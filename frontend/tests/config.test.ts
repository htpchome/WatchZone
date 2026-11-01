import { describe, expect, it } from "vitest";

import { normalizeCardConfig } from "../src/core/config";
import { CARD_TYPE } from "../src/core/constants";

describe("WatchZone card configuration", () => {
  it("defaults positive outer appearance options on and preserves both values", () => {
    expect(
      normalizeCardConfig({
        type: CARD_TYPE,
        title: "Camera",
      }),
    ).toEqual({
      type: CARD_TYPE,
      title: "Camera",
      rounded_outer_corners: true,
      outer_shadows: true,
    });

    expect(
      normalizeCardConfig({
        type: CARD_TYPE,
        title: "Camera",
        rounded_outer_corners: false,
        outer_shadows: false,
      }),
    ).toEqual({
      type: CARD_TYPE,
      title: "Camera",
      rounded_outer_corners: false,
      outer_shadows: false,
    });
  });

  it("rejects non-boolean outer appearance values", () => {
    expect(() =>
      normalizeCardConfig({
        type: CARD_TYPE,
        title: "Camera",
        outer_shadows: "yes",
      }),
    ).toThrow("outer_shadows must be a boolean");
  });
});
