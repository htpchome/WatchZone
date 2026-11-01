import { describe, expect, it, vi } from "vitest";

import { HomeAssistantLiveConnectionResolver } from "../src/connections/home-assistant/resolver";
import type { ClientEnvironment } from "../src/core/client-environment";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { MediaSessionManager } from "../src/core/media-session-manager";

function createResolver(host: "browser" | "catalyst" | "companion") {
  const ordinary = { key: "ordinary" };
  const catalyst = { key: "catalyst" };
  const sessions = {
    acquireHomeAssistantHls: vi.fn(() => ordinary),
    acquireHomeAssistantCatalystHls: vi.fn(() => catalyst),
  } as unknown as MediaSessionManager;
  const environment = {
    host,
    webRtcSupported: host !== "catalyst",
  } as ClientEnvironment;
  return {
    catalyst,
    environment,
    ordinary,
    resolver: new HomeAssistantLiveConnectionResolver(environment, sessions),
    sessions,
  };
}

describe("HomeAssistantLiveConnectionResolver", () => {
  it.each(["browser", "companion"] as const)(
    "keeps %s on the ordinary HLS pipeline",
    (host) => {
      const { ordinary, resolver, sessions } = createResolver(host);
      const result = resolver.acquireHls(
        {} as HomeAssistantApi,
        "camera.front",
        { initialMuted: true },
      );

      expect(result).toBe(ordinary);
      expect(resolver.hlsSessionKey("camera.front")).toBe(
        "home_assistant_hls:camera.front",
      );
      expect(sessions.acquireHomeAssistantHls).toHaveBeenCalledOnce();
      expect(sessions.acquireHomeAssistantCatalystHls).not.toHaveBeenCalled();
    },
  );

  it("selects only the Catalyst pipeline for the Catalyst host", () => {
    const { catalyst, resolver, sessions } = createResolver("catalyst");
    const result = resolver.acquireHls({} as HomeAssistantApi, "camera.front", {
      initialMuted: false,
    });

    expect(result).toBe(catalyst);
    expect(resolver.webRtcEligible).toBe(false);
    expect(resolver.hlsSessionKey("camera.front")).toBe(
      "home_assistant_catalyst_hls:camera.front",
    );
    expect(sessions.acquireHomeAssistantCatalystHls).toHaveBeenCalledOnce();
    expect(sessions.acquireHomeAssistantHls).not.toHaveBeenCalled();
  });
});
