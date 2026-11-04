import { describe, expect, it } from "vitest";

import { normalizeCardConfig } from "../src/core/config";
import { CARD_TYPE, MAX_CAMERAS } from "../src/core/constants";

describe("WatchZone card configuration", () => {
  it("defaults card appearance and starts with no cameras", () => {
    expect(normalizeCardConfig({ type: CARD_TYPE, title: "Camera" })).toEqual({
      type: CARD_TYPE,
      title: "Camera",
      rounded_outer_corners: true,
      outer_shadows: true,
      outer_padding: true,
      mobile_data_saving: false,
      cameras: [],
    });
  });

  it("normalizes per-camera defaults and preserves explicit options", () => {
    expect(
      normalizeCardConfig({
        cameras: [
          {
            entity_id: "camera.front",
            low_latency_hls: false,
            start_live_unmuted_pc_tablet: true,
          },
        ],
      }).cameras,
    ).toEqual([
      {
        entity_id: "camera.front",
        camera_rounded_corners: true,
        camera_shadows: true,
        low_latency_hls: false,
        start_live_unmuted_pc_tablet: true,
        start_live_unmuted_phone: false,
      },
    ]);
  });

  it("migrates the legacy single-camera shape", () => {
    expect(
      normalizeCardConfig({
        camera_entity: "camera.front",
        low_latency_hls: false,
        start_live_unmuted_phone: true,
      }).cameras,
    ).toMatchObject([
      {
        entity_id: "camera.front",
        low_latency_hls: false,
        start_live_unmuted_phone: true,
      },
    ]);
  });

  it("rejects invalid, duplicate, and excessive camera configuration", () => {
    expect(() => normalizeCardConfig({ mobile_data_saving: "yes" })).toThrow(
      "mobile_data_saving must be a boolean",
    );
    expect(() => normalizeCardConfig({ outer_shadows: "yes" })).toThrow(
      "outer_shadows must be a boolean",
    );
    expect(() =>
      normalizeCardConfig({
        cameras: [{ entity_id: "camera.front", camera_shadows: "yes" }],
      }),
    ).toThrow("camera_shadows must be a boolean");
    expect(() =>
      normalizeCardConfig({
        cameras: [{ entity_id: "camera.front" }, { entity_id: "camera.front" }],
      }),
    ).toThrow("WatchZone camera entities must be unique");
    expect(() =>
      normalizeCardConfig({
        cameras: Array.from({ length: MAX_CAMERAS + 1 }, (_, index) => ({
          entity_id: `camera.${index}`,
        })),
      }),
    ).toThrow(`WatchZone supports at most ${MAX_CAMERAS} cameras`);
  });
});
