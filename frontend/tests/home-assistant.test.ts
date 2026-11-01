import { describe, expect, it } from "vitest";

import {
  cameraImageUrl,
  type HomeAssistant,
  type HomeAssistantEntity,
} from "../src/core/home-assistant";

function hassWith(entity: HomeAssistantEntity): HomeAssistant {
  return {
    states: { [entity.entity_id]: entity },
    connection: { subscribeMessage: async () => () => undefined },
    callWS: async () => undefined as never,
    hassUrl: (path) => `https://ha.example${path}`,
  };
}

describe("Home Assistant camera image URL", () => {
  it("prefers the entity picture supplied by Home Assistant", () => {
    const hass = hassWith({
      entity_id: "camera.front",
      state: "streaming",
      attributes: {
        access_token: "ignored",
        entity_picture: "/api/camera_proxy/camera.front?token=current",
      },
    });

    expect(cameraImageUrl(hass, "camera.front")).toBe(
      "https://ha.example/api/camera_proxy/camera.front?token=current",
    );
  });

  it("builds an authenticated proxy URL when no entity picture is supplied", () => {
    const hass = hassWith({
      entity_id: "camera.front",
      state: "streaming",
      attributes: { access_token: "token + value" },
    });

    expect(cameraImageUrl(hass, "camera.front")).toBe(
      "https://ha.example/api/camera_proxy/camera.front?token=token%20%2B%20value",
    );
  });

  it("returns no URL when Home Assistant has no image credential", () => {
    const hass = hassWith({
      entity_id: "camera.front",
      state: "streaming",
      attributes: {},
    });

    expect(cameraImageUrl(hass, "camera.front")).toBeUndefined();
  });
});
