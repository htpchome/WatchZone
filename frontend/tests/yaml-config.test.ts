import { describe, expect, it } from "vitest";

import { normalizeCardConfig } from "../src/core/config";
import { CARD_TYPE, DEFAULT_CARD_TITLE } from "../src/core/constants";
import { toYamlCardConfig } from "../src/core/yaml-config";

describe("WatchZone YAML configuration manager", () => {
  it("omits known defaults", () => {
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          type: CARD_TYPE,
          title: DEFAULT_CARD_TITLE,
        }),
      ),
    ).toEqual({ type: CARD_TYPE });
  });

  it("keeps non-default values and unknown HA configuration", () => {
    expect(
      toYamlCardConfig(
        normalizeCardConfig({
          type: CARD_TYPE,
          title: "Front",
          camera_entity: "camera.front",
          rounded_outer_corners: false,
          outer_shadows: false,
          outer_padding: false,
          camera_rounded_corners: false,
          camera_shadows: false,
          grid_options: { columns: 8 },
        }),
      ),
    ).toEqual({
      type: CARD_TYPE,
      title: "Front",
      camera_entity: "camera.front",
      rounded_outer_corners: false,
      outer_shadows: false,
      outer_padding: false,
      camera_rounded_corners: false,
      camera_shadows: false,
      grid_options: { columns: 8 },
    });
  });
});
