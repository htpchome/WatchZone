import { afterEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import type {
  ConnectionFactory,
  MediaConnection,
} from "../src/core/media-session-manager";
import "../src/stage/modules/minimal-camera/minimal-camera";
import type { MinimalCameraModule } from "../src/stage/modules/minimal-camera/minimal-camera";
import {
  installTestMediaSessionManager,
  removeTestMediaSessionManager,
  TestMediaSessionManager as MediaSessionManager,
} from "./test-media-session-manager";

describe("minimal camera module", () => {
  afterEach(() => {
    vi.useRealTimers();
    removeTestMediaSessionManager();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("settles after presenting a ready WebRTC session", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const video = document.createElement("video");
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const webRtcFactory = vi.fn<ConnectionFactory>(async () =>
      webRtcConnection(video, stream),
    );
    installTestMediaSessionManager(
      new MediaSessionManager(
        webRtcFactory,
        vi.fn<ConnectionFactory>(async () => new Promise(() => undefined)),
      ),
    );
    const camera = document.createElement(
      "wzc-minimal-camera",
    ) as MinimalCameraModule;
    const requestUpdate = vi.spyOn(camera, "requestUpdate");
    camera.api = createApi();
    camera.available = true;
    camera.camera = {
      connection: "home_assistant",
      entityId: "camera.front",
      frigateFallback: "mse",
      lowLatencyHls: true,
      startUnmutedPcTablet: false,
      startUnmutedPhone: false,
      title: "Front",
    };
    document.body.append(camera);

    await vi.waitFor(() =>
      expect(camera.shadowRoot?.querySelector(".video-host.webrtc video")).toBe(
        video,
      ),
    );
    video.dispatchEvent(new Event("canplay"));
    await vi.waitFor(() =>
      expect(
        camera.shadowRoot?.querySelector(".video-host.webrtc.selected video"),
      ).toBe(video),
    );
    await camera.updateComplete;
    const settledUpdateCount = requestUpdate.mock.calls.length;

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(requestUpdate).toHaveBeenCalledTimes(settledUpdateCount);
    expect(webRtcFactory).toHaveBeenCalledOnce();
  });

  it("performs the default surface action without treating controls as taps", async () => {
    vi.useFakeTimers();
    const camera = document.createElement(
      "wzc-minimal-camera",
    ) as MinimalCameraModule;
    camera.camera = {
      connection: "home_assistant",
      entityId: "camera.front",
      frigateFallback: "mse",
      lowLatencyHls: true,
      startUnmutedPcTablet: false,
      startUnmutedPhone: false,
      title: "Front",
    };
    const moreInfo = vi.fn();
    camera.addEventListener("hass-more-info", moreInfo);
    document.body.append(camera);
    await camera.updateComplete;

    camera.shadowRoot
      ?.querySelector<HTMLElement>(".interaction-surface")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    expect(moreInfo).toHaveBeenCalledOnce();
    expect((moreInfo.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      entityId: "camera.front",
    });

    camera.shadowRoot?.querySelector<HTMLButtonElement>(".control")?.click();
    await vi.advanceTimersByTimeAsync(250);
    expect(moreInfo).toHaveBeenCalledOnce();
  });

  it("uses the configured double-tap action instead of also firing tap", async () => {
    vi.useFakeTimers();
    const camera = document.createElement(
      "wzc-minimal-camera",
    ) as MinimalCameraModule;
    camera.camera = {
      connection: "home_assistant",
      entityId: "camera.front",
      frigateFallback: "mse",
      lowLatencyHls: true,
      startUnmutedPcTablet: false,
      startUnmutedPhone: false,
      title: "Front",
    };
    camera.doubleTapAction = { action: "more-info" };
    camera.tapAction = { action: "none" };
    const moreInfo = vi.fn();
    camera.addEventListener("hass-more-info", moreInfo);
    document.body.append(camera);
    await camera.updateComplete;
    const viewport = camera.shadowRoot?.querySelector<HTMLElement>(
      ".interaction-surface",
    );

    viewport?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    viewport?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    viewport?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    expect(moreInfo).toHaveBeenCalledOnce();
  });
});

function createApi(): HomeAssistantApi {
  return {
    identity: {} as HomeAssistantApi["identity"],
    callWS: vi.fn(),
    resolveUrl: (path) => path,
    subscribeMessage: vi.fn(),
  };
}

function webRtcConnection(
  video: HTMLVideoElement,
  stream: MediaStream,
): MediaConnection {
  video.srcObject = stream;
  return { stream, video, transport: "webrtc", close: vi.fn() };
}
