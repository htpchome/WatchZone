import { describe, expect, it, vi } from "vitest";

import {
  captureVideoFrame,
  snapshotFilename,
} from "../src/stage/modules/camera/live/frame-capture";

describe("camera frame capture", () => {
  it("encodes the current video frame at its native dimensions", async () => {
    const video = document.createElement("video");
    Object.defineProperties(video, {
      readyState: { value: HTMLMediaElement.HAVE_CURRENT_DATA },
      videoHeight: { value: 1080 },
      videoWidth: { value: 1920 },
    });
    const drawImage = vi.fn();
    const canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getContext").mockReturnValue({ drawImage } as never);
    vi.spyOn(canvas, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["frame"], { type: "image/jpeg" }));
    });
    const createElement = vi.spyOn(document, "createElement");
    createElement.mockImplementation(((name: string) =>
      name === "canvas"
        ? canvas
        : Document.prototype.createElement.call(document, name)) as never);

    const frame = await captureVideoFrame(video);

    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1920, 1080);
    expect(frame.type).toBe("image/jpeg");
    createElement.mockRestore();
  });

  it("builds a filesystem-safe camera filename", () => {
    expect(
      snapshotFilename(
        "camera/front porch",
        new Date("2026-11-02T22:00:01.123Z"),
      ),
    ).toBe("camera-front-porch_2026-11-02T22-00-01Z.jpg");
  });
});
