import { describe, expect, it, vi } from "vitest";

import { LiveSourceResolver } from "../src/providers/live-source-resolver";
import type { ClientEnvironment } from "../src/core/client-environment";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { MediaSessionManager } from "../src/core/media-session-manager";

describe("LiveSourceResolver", () => {
  it.each(["browser", "companion"] as const)(
    "routes %s through the shared Home Assistant HLS session",
    (host) => {
      const ordinary = { key: "ordinary" };
      const sessions = {
        acquire: vi.fn(() => ordinary),
      } as unknown as MediaSessionManager;
      const environment = {
        host,
        webRtcSupported: true,
      } as ClientEnvironment;
      const resolver = new LiveSourceResolver(environment, sessions);

      expect(
        resolver.acquireHls({} as HomeAssistantApi, "camera.front", {
          initialMuted: true,
        }),
      ).toBe(ordinary);
      expect(resolver.hlsSessionKey("camera.front")).toBe(
        "ha_direct:hls:camera.front",
      );
      expect(sessions.acquire).toHaveBeenCalledWith(
        expect.objectContaining({
          entityId: "camera.front",
          key: "ha_direct:hls:camera.front",
          retention: "fallback",
        }),
      );
    },
  );
});
