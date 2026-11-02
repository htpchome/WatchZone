import { describe, expect, it, vi } from "vitest";

import { renderMediaPresentation } from "../src/modules/camera/live/media-presentation";

describe("camera media presentation", () => {
  it("renders the WebRTC hedge without owning transport policy", async () => {
    const container = document.createElement("div");
    const { render } = await import("lit");
    render(
      renderMediaPresentation({
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
  });
});
