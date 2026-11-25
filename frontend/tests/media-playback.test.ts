import { describe, expect, it, vi } from "vitest";

import { observeMediaElementAdvance } from "../src/core/media-playback";

describe("media playback readiness", () => {
  it("accepts a normal readiness event when an exposed frame callback stalls", () => {
    const video = document.createElement("video");
    const onAdvance = vi.fn();
    const cancelVideoFrameCallback = vi.fn();
    video.requestVideoFrameCallback = vi.fn(() => 7);
    video.cancelVideoFrameCallback = cancelVideoFrameCallback;

    observeMediaElementAdvance(video, onAdvance, true);
    video.dispatchEvent(new Event("loadeddata"));

    expect(onAdvance).toHaveBeenCalledOnce();
    expect(cancelVideoFrameCallback).toHaveBeenCalledWith(7);
  });

  it("still requires advancing media when readiness fallback is disabled", () => {
    const video = document.createElement("video");
    const onAdvance = vi.fn();
    video.requestVideoFrameCallback = vi.fn(() => 8);
    video.cancelVideoFrameCallback = vi.fn();

    observeMediaElementAdvance(video, onAdvance);
    video.dispatchEvent(new Event("loadeddata"));

    expect(onAdvance).not.toHaveBeenCalled();
  });
});
