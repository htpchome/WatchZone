import { describe, expect, it, vi } from "vitest";

import { createHomeAssistantMediaPresentation } from "../src/connections/home-assistant/presentation";

describe("Home Assistant host presentation isolation", () => {
  it.each(["browser", "companion"] as const)(
    "keeps the proven %s WebRTC hedge",
    async (host) => {
      const container = document.createElement("div");
      const presentation = createHomeAssistantMediaPresentation(host);
      expect(presentation.ownsAutomaticPlayback).toBe(false);
      const { render } = await import("lit");
      render(
        presentation.render({
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
      expect(container.querySelector(".native-edge-isolation")).toBeNull();
    },
  );

  it("gives Catalyst one isolated native-HLS surface", async () => {
    const container = document.createElement("div");
    const presentation = createHomeAssistantMediaPresentation("catalyst");
    expect(presentation.ownsAutomaticPlayback).toBe(true);
    const { render } = await import("lit");
    render(
      presentation.render({
        muted: false,
        onWebRtcLoadedData: vi.fn(),
        selected: "hls",
      }),
      container,
    );

    expect(container.querySelectorAll(".hls-host")).toHaveLength(1);
    expect(container.querySelector(".native-edge-isolation")).toBeTruthy();
    expect(container.querySelector("video")).toBeNull();
  });
});
