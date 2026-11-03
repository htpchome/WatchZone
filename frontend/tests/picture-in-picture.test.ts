import { afterEach, describe, expect, it, vi } from "vitest";

import {
  suppressNativePictureInPicture,
  togglePictureInPicture,
} from "../src/modules/camera/picture-in-picture";
import type { CameraLivePresentation } from "../src/modules/camera/live/presentation";
import "../src/modules/camera/live/presentation";

describe("camera Picture-in-Picture", () => {
  const pictureInPictureElementDescriptor = Object.getOwnPropertyDescriptor(
    document,
    "pictureInPictureElement",
  );
  const pictureInPictureEnabledDescriptor = Object.getOwnPropertyDescriptor(
    document,
    "pictureInPictureEnabled",
  );

  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (pictureInPictureElementDescriptor) {
      Object.defineProperty(
        document,
        "pictureInPictureElement",
        pictureInPictureElementDescriptor,
      );
    } else {
      Reflect.deleteProperty(document, "pictureInPictureElement");
    }
    if (pictureInPictureEnabledDescriptor) {
      Object.defineProperty(
        document,
        "pictureInPictureEnabled",
        pictureInPictureEnabledDescriptor,
      );
    } else {
      Reflect.deleteProperty(document, "pictureInPictureEnabled");
    }
  });

  it("temporarily lifts native PiP suppression for a custom user action", async () => {
    const video = document.createElement("video");
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue();
    vi.spyOn(video, "getBoundingClientRect").mockReturnValue({
      width: 640,
    } as DOMRect);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      value: null,
      writable: true,
    });
    const request = vi.fn(async () => {
      expect(video.disablePictureInPicture).toBe(false);
      Object.defineProperty(document, "pictureInPictureElement", {
        configurable: true,
        value: video,
        writable: true,
      });
      return {} as PictureInPictureWindow;
    });
    Object.defineProperty(video, "requestPictureInPicture", {
      configurable: true,
      value: request,
    });

    suppressNativePictureInPicture(video);
    expect(video.disablePictureInPicture).toBe(true);
    expect(video.getAttribute("controlslist")?.split(/\s+/)).toContain(
      "nopictureinpicture",
    );
    expect(await togglePictureInPicture(video)).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(video.disablePictureInPicture).toBe(false);

    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      value: null,
      writable: true,
    });
    video.dispatchEvent(new Event("leavepictureinpicture"));
    expect(video.disablePictureInPicture).toBe(true);
    expect(play).toHaveBeenCalled();
  });

  it("uses the WebKit presentation fallback when the standard API is absent", async () => {
    const video = document.createElement("video") as HTMLVideoElement & {
      webkitPresentationMode: "inline" | "picture-in-picture";
      webkitSetPresentationMode(mode: "inline" | "picture-in-picture"): void;
      webkitSupportsPresentationMode(mode: "picture-in-picture"): boolean;
    };
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(video, "getBoundingClientRect").mockReturnValue({
      width: 640,
    } as DOMRect);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    video.webkitPresentationMode = "inline";
    video.webkitSupportsPresentationMode = () => true;
    video.webkitSetPresentationMode = (mode) => {
      video.webkitPresentationMode = mode;
    };

    suppressNativePictureInPicture(video);
    expect(await togglePictureInPicture(video)).toBe(true);
    expect(video.webkitPresentationMode).toBe("picture-in-picture");
    expect(video.disablePictureInPicture).toBe(false);

    expect(await togglePictureInPicture(video)).toBe(false);
    expect(video.webkitPresentationMode).toBe("inline");
    expect(video.disablePictureInPicture).toBe(true);
  });

  it("enables the custom action when a retained HLS video becomes active", async () => {
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(document, "pictureInPictureElement", {
      configurable: true,
      value: null,
      writable: true,
    });
    const hlsVideo = document.createElement("video");
    const request = vi.fn(async () => ({}) as PictureInPictureWindow);
    Object.defineProperty(hlsVideo, "requestPictureInPicture", {
      configurable: true,
      value: request,
    });
    const presentation = document.createElement(
      "wzc-camera-live",
    ) as CameraLivePresentation;
    presentation.available = true;
    presentation.hlsVideo = hlsVideo;
    presentation.selected = "hls";
    presentation.transport = "hls_mse";
    document.body.append(presentation);

    const pictureInPictureButton = (): HTMLButtonElement | null =>
      presentation.shadowRoot
        ?.querySelector("wzc-camera-controls")
        ?.shadowRoot?.querySelector<HTMLButtonElement>(
          '[data-control="picture_in_picture"]',
        ) ?? null;
    await vi.waitFor(() =>
      expect(pictureInPictureButton()?.disabled).toBe(false),
    );
    expect(hlsVideo.disablePictureInPicture).toBe(true);
    expect(hlsVideo.getAttribute("controlslist")?.split(/\s+/)).toContain(
      "nopictureinpicture",
    );

    pictureInPictureButton()?.click();
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  });

  it("suppresses native PiP before the rendered WebRTC video is painted", async () => {
    const presentation = document.createElement(
      "wzc-camera-live",
    ) as CameraLivePresentation;
    document.body.append(presentation);
    await vi.waitFor(() =>
      expect(
        presentation.webRtcVideo?.getAttribute("controlslist")?.split(/\s+/),
      ).toContain("nopictureinpicture"),
    );
    expect(
      presentation.webRtcVideo?.getAttribute("disablepictureinpicture"),
    ).toBe("");
  });
});
