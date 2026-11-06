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
          camera_bar_shadows: false,
          camera_rounded_corners: false,
          camera_shadows: false,
          cameras: [
            {
              connection_source: "frigate_go2rtc",
              entity_id: "camera.front",
              lights: [
                { entity_id: "light.porch", icon: "mdi:coach-lamp" },
                { entity_id: "light.driveway" },
              ],
              low_latency_hls: false,
              ptz_enabled: true,
              start_live_unmuted_pc_tablet: true,
              start_live_unmuted_phone: true,
              title: "Front Door",
              two_way_talk_enabled: true,
            },
          ],
          rounded_outer_corners: false,
          outer_shadows: false,
          outer_padding: false,
          mobile_data_saving: true,
          grid_options: { columns: 8 },
        }),
      ),
    ).toEqual({
      type: CARD_TYPE,
      title: "Front",
      camera_bar_shadows: false,
      camera_rounded_corners: false,
      camera_shadows: false,
      cameras: [
        {
          connection_source: "frigate_go2rtc",
          entity_id: "camera.front",
          lights: [
            { entity_id: "light.porch", icon: "mdi:coach-lamp" },
            { entity_id: "light.driveway" },
          ],
          low_latency_hls: false,
          ptz_enabled: true,
          start_live_unmuted_pc_tablet: true,
          start_live_unmuted_phone: true,
          title: "Front Door",
          two_way_talk_enabled: true,
        },
      ],
      rounded_outer_corners: false,
      outer_shadows: false,
      outer_padding: false,
      mobile_data_saving: true,
      grid_options: { columns: 8 },
    });
  });
});
