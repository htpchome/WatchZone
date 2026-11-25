import { afterEach, describe, expect, it, vi } from "vitest";

import { attachWebRtcVideo } from "../src/core/webrtc-peer-connection";

describe("retained WebRTC video", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("replaces the parked media element without closing the retained peer", () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const close = vi.fn();
    const onVideo = vi.fn();
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    const load = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => undefined);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const connection = attachWebRtcVideo({ stream, close }, true, onVideo);
    const video = connection.video!;

    expect(video.srcObject).toBe(stream);
    video.muted = false;
    connection.park?.();
    connection.park?.();

    expect(pause).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(load).toHaveBeenCalledOnce();
    expect(video.isConnected).toBe(false);
    expect(close).not.toHaveBeenCalled();
    expect(stream.getTracks()).toEqual([]);

    void connection.resume?.();
    expect(connection.video).not.toBe(video);
    expect(connection.video?.srcObject).toBe(stream);
    expect(connection.video?.muted).toBe(false);
    expect(onVideo).toHaveBeenCalledWith(connection.video);
    const replacementVideo = connection.video;
    void connection.resume?.();
    expect(connection.video).toBe(replacementVideo);
    expect(onVideo).toHaveBeenCalledOnce();
  });

  it("resets the media pipeline before closing the peer", () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const close = vi.fn();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(
      () => undefined,
    );
    const load = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => undefined);
    const connection = attachWebRtcVideo({ stream, close }, true);

    connection.close();

    expect(connection.video?.srcObject).toBeNull();
    expect(load).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
