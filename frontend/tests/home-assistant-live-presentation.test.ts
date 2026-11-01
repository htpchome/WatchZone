import { describe, expect, it, vi } from "vitest";

import { renderHomeAssistantMediaPresentation } from "../src/connections/home-assistant/presentation";

describe("Home Assistant host presentation isolation", () => {
  it.each(["browser", "companion"] as const)(
    "keeps the proven %s WebRTC hedge",
    async () => {
      const container = document.createElement("div");
      const { render } = await import("lit");
      render(
        renderHomeAssistantMediaPresentation({
          muted: false,
          onWebRtcLoadedData: vi.fn(),
          selected: "hls",
        }),
        container,
      );

      const video = container.querySelector<HTMLVideoElement>("video.webrtc");
      expect(video?.autoplay).toBe(true);
      expect(video?.muted).toBe(false);
      expect(video?.hidden).toBe(true);
    },
  );
});
