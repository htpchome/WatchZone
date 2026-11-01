import { describe, expect, it } from "vitest";

import { normalizeCardConfig } from "../src/core/config";
import { CARD_TYPE } from "../src/core/constants";

describe("WatchZone card configuration", () => {
  it("defaults card and camera appearance options on and preserves false", () => {
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
      outer_padding: true,
      camera_rounded_corners: true,
      camera_shadows: true,
    });

    expect(
      normalizeCardConfig({
        type: CARD_TYPE,
        title: "Camera",
        rounded_outer_corners: false,
        outer_shadows: false,
        outer_padding: false,
        camera_rounded_corners: false,
        camera_shadows: false,
      }),
    ).toEqual({
      type: CARD_TYPE,
      title: "Camera",
      rounded_outer_corners: false,
      outer_shadows: false,
      outer_padding: false,
      camera_rounded_corners: false,
      camera_shadows: false,
    });
  });

  it("rejects non-boolean appearance values", () => {
    expect(() =>
      normalizeCardConfig({
        type: CARD_TYPE,
        title: "Camera",
        outer_shadows: "yes",
      }),
    ).toThrow("outer_shadows must be a boolean");

    expect(() =>
      normalizeCardConfig({
        type: CARD_TYPE,
        title: "Camera",
        outer_padding: "yes",
      }),
    ).toThrow("outer_padding must be a boolean");

    expect(() =>
      normalizeCardConfig({
        type: CARD_TYPE,
        title: "Camera",
        camera_shadows: "yes",
      }),
    ).toThrow("camera_shadows must be a boolean");
  });
});
