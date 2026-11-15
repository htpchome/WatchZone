import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => {
    Object.defineProperties(HTMLDialogElement.prototype, {
      close: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.removeAttribute("open");
          this.dispatchEvent(new Event("close"));
        },
      },
      showModal: {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.setAttribute("open", "");
        },
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    removeTestMediaSessionManager();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("settles after presenting a ready WebRTC session", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const video = document.createElement("video");
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 2 },
      videoHeight: { configurable: true, value: 360 },
      videoWidth: { configurable: true, value: 640 },
    });
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["snapshot"], { type: "image/jpeg" })),
    );
    const objectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:watchzone-snapshot");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
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

    camera.shadowRoot
      ?.querySelector<HTMLButtonElement>(".interaction-surface")
      ?.click();
    await vi.waitFor(() =>
      expect(
        camera.shadowRoot?.querySelector(".dialog-video-host.webrtc video"),
      ).toBe(video),
    );
    expect(
      camera.shadowRoot?.querySelector<HTMLDialogElement>(".live-dialog")?.open,
    ).toBe(true);
    expect(
      camera.shadowRoot?.querySelector(".source-control")?.textContent,
    ).toBe("WebRTC");
    const controls = camera.shadowRoot?.querySelector<HTMLElement>(".controls");
    expect(controls?.hidden).toBe(true);
    camera.shadowRoot
      ?.querySelector<HTMLButtonElement>(".menu-toggle")
      ?.click();
    await camera.updateComplete;
    expect(controls?.hidden).toBe(false);
    const download = camera.shadowRoot?.querySelector<HTMLElement>(
      ".live-dialog-footer ha-button",
    );
    expect(download?.textContent).toContain("Download Snapshot");
    download?.click();
    await vi.waitFor(() => expect(objectUrl).toHaveBeenCalledOnce());
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
    camera.shadowRoot
      ?.querySelector<HTMLButtonElement>(".dialog-close")
      ?.click();
    await vi.waitFor(() =>
      expect(camera.shadowRoot?.querySelector(".video-host.webrtc video")).toBe(
        video,
      ),
    );
    expect(webRtcFactory).toHaveBeenCalledOnce();
  });

  it("opens its live dialog by default without treating controls as taps", async () => {
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
    document.body.append(camera);
    await camera.updateComplete;

    camera.shadowRoot
      ?.querySelector<HTMLElement>(".interaction-surface")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    const dialog =
      camera.shadowRoot?.querySelector<HTMLDialogElement>(".live-dialog");
    expect(dialog?.open).toBe(true);

    camera.shadowRoot
      ?.querySelector<HTMLButtonElement>(".menu-toggle")
      ?.click();
    await vi.advanceTimersByTimeAsync(250);
    expect(dialog?.open).toBe(true);
  });

  it("hides the expanded control menu after five seconds", async () => {
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
    document.body.append(camera);
    await camera.updateComplete;
    const menu =
      camera.shadowRoot?.querySelector<HTMLButtonElement>(".menu-toggle");
    const controls = camera.shadowRoot?.querySelector<HTMLElement>(".controls");

    menu?.click();
    await camera.updateComplete;
    expect(controls?.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(controls?.hidden).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await camera.updateComplete;
    expect(controls?.hidden).toBe(true);
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
