import { afterEach, describe, expect, it, vi } from "vitest";

import { attachWebRtcVideo } from "../src/core/webrtc-peer-connection";

describe("retained WebRTC video", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resets the parked media pipeline without closing the retained peer", () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const close = vi.fn();
    const pause = vi
      .spyOn(HTMLMediaElement.prototype, "pause")
      .mockImplementation(() => undefined);
    const load = vi
      .spyOn(HTMLMediaElement.prototype, "load")
      .mockImplementation(() => undefined);
    const connection = attachWebRtcVideo({ stream, close }, true);
    const video = connection.video!;

    expect(video.srcObject).toBe(stream);
    connection.park?.();

    expect(pause).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(load).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    expect(stream.getTracks()).toEqual([]);
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
