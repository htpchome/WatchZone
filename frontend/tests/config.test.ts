import { describe, expect, it } from "vitest";

import { normalizeCardConfig } from "../src/core/config";
import { CARD_TYPE } from "../src/core/constants";

describe("WatchZone card configuration", () => {
  it("stores enabled outer appearance removals and omits disabled defaults", () => {
    expect(
      normalizeCardConfig({
        type: CARD_TYPE,
        title: "Camera",
        remove_outer_rounded_edges: true,
        remove_outer_shadow: true,
      }),
    ).toMatchObject({
      remove_outer_rounded_edges: true,
      remove_outer_shadow: true,
    });

    expect(
      normalizeCardConfig({
        type: CARD_TYPE,
        title: "Camera",
        remove_outer_rounded_edges: false,
        remove_outer_shadow: false,
      }),
    ).toEqual({ type: CARD_TYPE, title: "Camera" });
  });

  it("rejects non-boolean outer appearance values", () => {
    expect(() =>
      normalizeCardConfig({
        type: CARD_TYPE,
        title: "Camera",
        remove_outer_shadow: "yes",
      }),
    ).toThrow("remove_outer_shadow must be a boolean");
  });
});
