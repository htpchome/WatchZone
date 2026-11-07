import { describe, expect, it } from "vitest";

import {
  hlsLiveEdgePolicy,
  monitorHlsLiveEdge,
  type HlsLiveEdgePolicy,
} from "../src/providers/live/hls-live-edge";

describe("HLS live-edge policy", () => {
  it("preserves advertised LL-HLS latency while adding a finite correction bound", () => {
    const policy = hlsLiveEdgePolicy(
      [
        "#EXTM3U",
        "#EXT-X-TARGETDURATION:6",
        "#EXT-X-PART-INF:PART-TARGET=1.000",
        "#EXT-X-SERVER-CONTROL:CAN-BLOCK-RELOAD=YES,PART-HOLD-BACK=2.000",
      ].join("\n"),
      true,
    );

    expect(policy).toMatchObject({
      hlsJsConfig: {
        liveMaxLatencyDuration: 8,
        liveSyncDuration: 2,
      },
      maxLatencySeconds: 8,
      targetLatencySeconds: 2,
    });
  });

  it("uses the standard three-segment target and five-segment bound", () => {
    const policy = hlsLiveEdgePolicy(
      "#EXTM3U\n#EXT-X-TARGETDURATION:6\n",
      false,
    );

    expect(policy).toMatchObject({
      hlsJsConfig: {
        liveMaxLatencyDuration: 30,
        liveSyncDuration: 18,
      },
      maxLatencySeconds: 30,
      targetLatencySeconds: 18,
    });
  });

  it("catches up gently, hard-resyncs at the bound, and cleans up", () => {
    const video = document.createElement("video");
    const policy: HlsLiveEdgePolicy = {
      hlsJsConfig: {
        liveMaxLatencyDuration: 20,
        liveSyncDuration: 10,
      },
      maxLatencySeconds: 20,
      targetLatencySeconds: 10,
    };
    Object.defineProperties(video, {
      ended: { configurable: true, value: false },
      paused: { configurable: true, value: false },
      readyState: {
        configurable: true,
        value: HTMLMediaElement.HAVE_FUTURE_DATA,
      },
      seekable: {
        configurable: true,
        value: {
          end: () => 60,
          length: 1,
          start: () => 0,
        },
      },
    });
    const stop = monitorHlsLiveEdge(video, policy);

    video.currentTime = 45;
    video.dispatchEvent(new Event("timeupdate"));
    expect(video.playbackRate).toBe(1.05);
    expect(video.currentTime).toBe(45);

    video.currentTime = 30;
    video.dispatchEvent(new Event("timeupdate"));
    expect(video.playbackRate).toBe(1);
    expect(video.currentTime).toBe(50);

    stop();
    video.currentTime = 30;
    video.dispatchEvent(new Event("timeupdate"));
    expect(video.currentTime).toBe(30);
    expect(video.playbackRate).toBe(1);
  });
});
