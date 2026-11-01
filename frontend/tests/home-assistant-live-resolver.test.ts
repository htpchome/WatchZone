import { describe, expect, it, vi } from "vitest";

import { HomeAssistantLiveConnectionResolver } from "../src/connections/home-assistant/resolver";
import type { ClientEnvironment } from "../src/core/client-environment";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { MediaSessionManager } from "../src/core/media-session-manager";

describe("HomeAssistantLiveConnectionResolver", () => {
  it.each(["browser", "companion"] as const)(
    "routes %s through the shared Home Assistant HLS session",
    (host) => {
      const ordinary = { key: "ordinary" };
      const sessions = {
        acquireHomeAssistantHls: vi.fn(() => ordinary),
      } as unknown as MediaSessionManager;
      const environment = {
        host,
        webRtcSupported: true,
      } as ClientEnvironment;
      const resolver = new HomeAssistantLiveConnectionResolver(
        environment,
        sessions,
      );

      expect(
        resolver.acquireHls({} as HomeAssistantApi, "camera.front", {
          initialMuted: true,
        }),
      ).toBe(ordinary);
      expect(resolver.hlsSessionKey("camera.front")).toBe(
        "home_assistant_hls:camera.front",
      );
      expect(sessions.acquireHomeAssistantHls).toHaveBeenCalledOnce();
    },
  );
});
