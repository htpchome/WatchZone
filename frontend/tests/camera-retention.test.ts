import { afterEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import { CameraSessionContext } from "../src/core/camera-session-context";
import {
  type ConnectionFactory,
  getMediaSessionManager,
  type MediaConnection,
} from "../src/core/media-session-manager";
import type { CameraModule } from "../src/modules/camera/camera";
import type { CameraView } from "../src/modules/camera/camera-view";
import type { CameraLivePresentation } from "../src/modules/camera/live/presentation";
import "../src/modules/camera/camera";
import "../src/modules/camera/camera-view";
import {
  installTestMediaSessionManager,
  removeTestMediaSessionManager,
  TestMediaSessionManager as MediaSessionManager,
} from "./test-media-session-manager";

function createLiveView(
  api: HomeAssistantApi,
  startUnmutedPcTablet = false,
  startUnmutedPhone = false,
): CameraView {
  const view = document.createElement("wzc-camera-view");
  view.api = api;
  view.active = true;
  view.connect = true;
  view.available = true;
  view.startUnmutedPcTablet = startUnmutedPcTablet;
  view.startUnmutedPhone = startUnmutedPhone;
  view.entityId = "camera.front";
  return view;
}

function webRtcConnection(
  stream: MediaStream,
  close: () => void = vi.fn(),
): MediaConnection {
  const video = document.createElement("video");
  video.srcObject = stream;
  return { stream, video, transport: "webrtc", close };
}

function presentation(view: CameraView): CameraLivePresentation | undefined {
  return (
    view.shadowRoot?.querySelector<CameraLivePresentation>("wzc-camera-live") ??
    undefined
  );
}

function cameraControl(view: CameraView): HTMLElement {
  const controls = presentation(view)?.shadowRoot?.querySelector<HTMLElement>(
    "wzc-camera-controls",
  );
  if (!controls) throw new Error("Camera controls are not rendered");
  return controls;
}

function toggleMute(view: CameraView): void {
  cameraControl(view).dispatchEvent(
    new CustomEvent("camera-control", {
      detail: { action: "mute" },
      bubbles: true,
      composed: true,
    }),
  );
}

function installHlsSession(): {
  readonly api: HomeAssistantApi;
  readonly hlsVideo: HTMLVideoElement;
} {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const hlsVideo = document.createElement("video");
  installTestMediaSessionManager(
    new MediaSessionManager(
      vi.fn<ConnectionFactory>(async () => ({ close: vi.fn() })),
      vi.fn<ConnectionFactory>(async () => ({
        video: hlsVideo,
        transport: "hls_mse",
        close: vi.fn(),
      })),
    ),
  );
  return { api: createApi(), hlsVideo };
}

describe("camera presentation retention", () => {
  afterEach(() => {
    vi.useRealTimers();
    removeTestMediaSessionManager();
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("does not duplicate pending media connections during rapid carousel navigation", async () => {
    const webRtcFactory = vi.fn<ConnectionFactory>(
      async () => new Promise(() => undefined),
    );
    const hlsFactory = vi.fn<ConnectionFactory>(
      async () => new Promise(() => undefined),
    );
    installTestMediaSessionManager(
      new MediaSessionManager(webRtcFactory, hlsFactory),
    );
    const camera = document.createElement("wzc-camera") as CameraModule;
    camera.api = createApi();
    camera.cameras = [cameraItem("camera.zero"), cameraItem("camera.one")];
    document.body.append(camera);

    await vi.waitFor(() => expect(webRtcFactory).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(hlsFactory).toHaveBeenCalledOnce());
    camera.shadowRoot
      ?.querySelector<HTMLButtonElement>(".carousel-navigation.next")
      ?.click();
    await camera.updateComplete;
    await vi.waitFor(() => expect(webRtcFactory).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(hlsFactory).toHaveBeenCalledTimes(2));

    for (let index = 0; index < 4; index += 1) {
      camera.shadowRoot
        ?.querySelector<HTMLButtonElement>(".carousel-navigation.previous")
        ?.click();
      await camera.updateComplete;
      camera.shadowRoot
        ?.querySelector<HTMLButtonElement>(".carousel-navigation.next")
        ?.click();
      await camera.updateComplete;
    }

    expect(webRtcFactory).toHaveBeenCalledTimes(2);
    expect(hlsFactory).toHaveBeenCalledTimes(2);
    expect(webRtcFactory.mock.calls.map((call) => call[1]).sort()).toEqual([
      "camera.one",
      "camera.zero",
    ]);
    expect(hlsFactory.mock.calls.map((call) => call[1]).sort()).toEqual([
      "camera.one",
      "camera.zero",
    ]);
  });

  it("keeps HLS selected across camera navigation when WebRTC never decoded", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const webRtcVideos = new Map<string, HTMLVideoElement>();
    const hlsVideos = new Map<string, HTMLVideoElement>();
    const webRtcFactory = vi.fn<ConnectionFactory>(async (_api, entityId) => {
      const stream = { getTracks: () => [] } as unknown as MediaStream;
      const video = document.createElement("video");
      video.srcObject = stream;
      webRtcVideos.set(entityId, video);
      return { stream, video, transport: "webrtc", close: vi.fn() };
    });
    const hlsFactory = vi.fn<ConnectionFactory>(async (_api, entityId) => {
      const video = document.createElement("video");
      hlsVideos.set(entityId, video);
      return { video, transport: "hls_mse", close: vi.fn() };
    });
    installTestMediaSessionManager(
      new MediaSessionManager(webRtcFactory, hlsFactory),
    );
    const camera = document.createElement("wzc-camera") as CameraModule;
    camera.api = createApi();
    camera.cameras = [cameraItem("camera.zero"), cameraItem("camera.one")];
    document.body.append(camera);

    const views = await vi.waitFor(() => {
      const elements = [
        ...(camera.shadowRoot?.querySelectorAll<CameraView>(
          "wzc-camera-view",
        ) ?? []),
      ];
      expect(elements).toHaveLength(2);
      return elements;
    });
    await vi.waitFor(() =>
      expect(presentation(views[0])?.selected).toBe("fallback"),
    );
    camera.shadowRoot
      ?.querySelector<HTMLButtonElement>(".carousel-navigation.next")
      ?.click();
    await vi.waitFor(() =>
      expect(presentation(views[1])?.selected).toBe("fallback"),
    );
    camera.shadowRoot
      ?.querySelector<HTMLButtonElement>(".carousel-navigation.previous")
      ?.click();
    await vi.waitFor(() =>
      expect(presentation(views[0])?.selected).toBe("fallback"),
    );

    expect(presentation(views[0])?.fallbackVideo).toBe(
      hlsVideos.get("camera.zero"),
    );
    expect(presentation(views[0])?.webRtcVideo).toBe(
      webRtcVideos.get("camera.zero"),
    );
    expect(webRtcFactory).toHaveBeenCalledTimes(2);
    expect(hlsFactory).toHaveBeenCalledTimes(2);
  });

  it("reattaches the retained HLS element after an editor presentation exits", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const hlsVideo = document.createElement("video");
    const webRtcFactory = vi.fn<ConnectionFactory>(async () => ({
      close: vi.fn(),
    }));
    const hlsFactory = vi.fn<ConnectionFactory>(async () => ({
      video: hlsVideo,
      transport: "hls_mse",
      close: vi.fn(),
    }));
    installTestMediaSessionManager(
      new MediaSessionManager(webRtcFactory, hlsFactory),
    );
    const identity = {} as HomeAssistantApi["identity"];
    const api: HomeAssistantApi = {
      identity,
      callWS: vi.fn(),
      resolveUrl: (path) => path,
      subscribeMessage: vi.fn(),
    };

    const preEditor = createLiveView(api);
    document.body.append(preEditor);
    await vi.waitFor(() =>
      expect(
        presentation(preEditor)?.shadowRoot?.querySelector(
          ".fallback-host video",
        ),
      ).toBe(hlsVideo),
    );

    const editorPreview = createLiveView(api);
    document.body.append(editorPreview);
    await vi.waitFor(() =>
      expect(
        presentation(editorPreview)?.shadowRoot?.querySelector(
          ".fallback-host video",
        ),
      ).toBe(hlsVideo),
    );
    expect(
      presentation(preEditor)?.shadowRoot?.querySelector(
        ".fallback-host video",
      ),
    ).toBeNull();

    editorPreview.remove();
    await vi.waitFor(() =>
      expect(
        presentation(preEditor)?.shadowRoot?.querySelector(
          ".fallback-host video",
        ),
      ).toBe(hlsVideo),
    );
    expect(hlsFactory).toHaveBeenCalledOnce();
    expect(webRtcFactory).toHaveBeenCalledOnce();
  });

  it("keeps retained HLS authoritative when WebRTC never decoded", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const webRtcVideo = document.createElement("video");
    webRtcVideo.srcObject = stream;
    const hlsVideo = document.createElement("video");
    const webRtcFactory = vi.fn<ConnectionFactory>(async () => ({
      stream,
      video: webRtcVideo,
      transport: "webrtc",
      close: vi.fn(),
    }));
    const hlsFactory = vi.fn<ConnectionFactory>(async () => ({
      video: hlsVideo,
      transport: "hls_mse",
      close: vi.fn(),
    }));
    installTestMediaSessionManager(
      new MediaSessionManager(webRtcFactory, hlsFactory),
    );
    const api = createApi();
    const first = createLiveView(api);
    document.body.append(first);
    await vi.waitFor(() =>
      expect(presentation(first)?.selected).toBe("fallback"),
    );
    expect(presentation(first)?.webRtcVideo).toBe(webRtcVideo);

    first.remove();
    const returned = createLiveView(api);
    document.body.append(returned);
    await vi.waitFor(() =>
      expect(presentation(returned)?.selected).toBe("fallback"),
    );

    expect(presentation(returned)?.webRtcVideo).toBe(webRtcVideo);
    expect(presentation(returned)?.fallbackVideo).toBe(hlsVideo);
    expect(webRtcFactory).toHaveBeenCalledOnce();
    expect(hlsFactory).toHaveBeenCalledOnce();
  });

  it("reattaches the same verified WebRTC player without restarting HLS", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const webRtcVideo = document.createElement("video");
    webRtcVideo.srcObject = stream;
    const closeWebRtc = vi.fn();
    const closeHls = vi.fn();
    const webRtcFactory = vi.fn<ConnectionFactory>(async () => ({
      stream,
      video: webRtcVideo,
      transport: "webrtc",
      close: closeWebRtc,
    }));
    const hlsFactory = vi.fn<ConnectionFactory>(async () => ({
      video: document.createElement("video"),
      transport: "hls_mse",
      close: closeHls,
    }));
    installTestMediaSessionManager(
      new MediaSessionManager(webRtcFactory, hlsFactory),
    );
    const api = createApi();
    const first = createLiveView(api);
    document.body.append(first);
    await vi.waitFor(() =>
      expect(presentation(first)?.webRtcVideo).toBe(webRtcVideo),
    );
    webRtcVideo.dispatchEvent(new Event("loadeddata"));
    await vi.waitFor(() =>
      expect(presentation(first)?.selected).toBe("webrtc"),
    );
    webRtcVideo.currentTime = 42;
    await vi.waitFor(() => expect(closeHls).toHaveBeenCalledOnce());

    first.remove();
    const returned = createLiveView(api);
    document.body.append(returned);
    await vi.waitFor(() =>
      expect(presentation(returned)?.selected).toBe("webrtc"),
    );

    expect(presentation(returned)?.webRtcVideo).toBe(webRtcVideo);
    expect(webRtcVideo.currentTime).toBe(42);
    expect(webRtcFactory).toHaveBeenCalledOnce();
    expect(hlsFactory).toHaveBeenCalledOnce();
    expect(closeWebRtc).not.toHaveBeenCalled();
  });

  it("attaches and primes an unmuted HLS candidate while it is connecting", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const hlsVideo = document.createElement("video");
    const hlsFactory = vi.fn<ConnectionFactory>(
      async (_api, _entity, _signal, _failure, _timing, options) => {
        hlsVideo.muted = options.initialMuted;
        hlsVideo.defaultMuted = options.initialMuted;
        options.onVideo?.(hlsVideo);
        return new Promise(() => undefined);
      },
    );
    installTestMediaSessionManager(
      new MediaSessionManager(
        vi.fn<ConnectionFactory>(async () => new Promise(() => undefined)),
        hlsFactory,
      ),
    );
    const view = createLiveView(createApi(), true);
    document.body.append(view);

    await vi.waitFor(() =>
      expect(
        presentation(view)?.shadowRoot?.querySelector(".fallback-host video"),
      ).toBe(hlsVideo),
    );
    expect(hlsFactory.mock.calls[0][5].initialMuted).toBe(false);
    expect(hlsVideo.muted).toBe(false);
    expect(hlsVideo.defaultMuted).toBe(false);
    expect(hlsVideo.parentElement?.hidden).toBe(false);
  });

  it("updates the source label when WebRTC takes over from HLS", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const hlsVideo = document.createElement("video");
    const closeHls = vi.fn();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    let resolveWebRtc: ((connection: MediaConnection) => void) | undefined;
    installTestMediaSessionManager(
      new MediaSessionManager(
        vi.fn<ConnectionFactory>(
          () =>
            new Promise((resolve) => {
              resolveWebRtc = resolve;
            }),
        ),
        vi.fn<ConnectionFactory>(async () => ({
          video: hlsVideo,
          transport: "hls_mse",
          close: closeHls,
        })),
      ),
    );
    const view = createLiveView(createApi(), true);
    document.body.append(view);

    await vi.waitFor(() =>
      expect(
        presentation(view)
          ?.shadowRoot?.querySelector(".source-indicator")
          ?.textContent?.trim(),
      ).toBe("HLS-LL · HLS.js"),
    );

    resolveWebRtc?.(webRtcConnection(stream));
    const webRtcVideo = await vi.waitFor(() => {
      const video =
        presentation(view)?.shadowRoot?.querySelector<HTMLVideoElement>(
          "video.webrtc",
        );
      expect(video?.srcObject).toBe(stream);
      return video;
    });
    expect(webRtcVideo?.hidden).toBe(false);
    expect(webRtcVideo?.classList.contains("candidate")).toBe(true);
    expect(webRtcVideo?.getAttribute("aria-hidden")).toBe("true");
    expect(webRtcVideo?.muted).toBe(true);
    webRtcVideo?.dispatchEvent(new Event("playing"));
    expect(closeHls).not.toHaveBeenCalled();

    await vi.waitFor(() =>
      expect(
        presentation(view)
          ?.shadowRoot?.querySelector(".source-indicator")
          ?.textContent?.trim(),
      ).toBe("WebRTC"),
    );
    expect(webRtcVideo?.classList.contains("candidate")).toBe(false);
    expect(webRtcVideo?.getAttribute("aria-hidden")).toBe("false");
    expect(webRtcVideo?.muted).toBe(false);
    expect(closeHls).toHaveBeenCalledOnce();
  });

  it("lets recovered WebRTC take presentation ownership from HLS again", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const streams = [
      { getTracks: () => [] } as unknown as MediaStream,
      { getTracks: () => [] } as unknown as MediaStream,
    ];
    const failures: Array<(error: Error) => void> = [];
    let webRtcAttempt = 0;
    const webRtcFactory = vi.fn<ConnectionFactory>(
      async (_api, _entity, _signal, onFailure) => {
        failures.push(onFailure);
        return webRtcConnection(streams[webRtcAttempt++]);
      },
    );
    const hlsFactory = vi.fn<ConnectionFactory>(async () => ({
      video: document.createElement("video"),
      transport: "hls_mse",
      close: vi.fn(),
    }));
    installTestMediaSessionManager(
      new MediaSessionManager(webRtcFactory, hlsFactory),
    );
    const view = createLiveView(createApi());
    document.body.append(view);

    const video = await vi.waitFor(() => {
      const element =
        presentation(view)?.shadowRoot?.querySelector<HTMLVideoElement>(
          "video.webrtc",
        );
      expect(element?.srcObject).toBe(streams[0]);
      return element;
    });
    expect(video?.classList.contains("candidate")).toBe(true);
    video?.dispatchEvent(new Event("canplay"));
    await vi.waitFor(() =>
      expect(
        presentation(view)
          ?.shadowRoot?.querySelector(".source-indicator")
          ?.textContent?.trim(),
      ).toBe("WebRTC"),
    );
    expect(video?.classList.contains("candidate")).toBe(false);

    failures[0](new Error("transient WebRTC failure"));
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.waitFor(() => expect(webRtcFactory).toHaveBeenCalledTimes(2));
    const recoveredVideo = await vi.waitFor(() => {
      const element = presentation(view)?.webRtcVideo;
      expect(element?.srcObject).toBe(streams[1]);
      return element;
    });
    recoveredVideo?.dispatchEvent(new Event("loadeddata"));

    await vi.waitFor(() =>
      expect(
        presentation(view)
          ?.shadowRoot?.querySelector(".source-indicator")
          ?.textContent?.trim(),
      ).toBe("WebRTC"),
    );
    expect(hlsFactory).toHaveBeenCalledTimes(2);
  });

  it("retries previously unavailable WebRTC once after HLS recovers", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    let webRtcAttempt = 0;
    let decodedFrame: VideoFrameRequestCallback | undefined;
    const webRtcFactory = vi.fn<ConnectionFactory>(async () => {
      if (webRtcAttempt++ === 0) throw new Error("WebRTC unavailable");
      const connection = webRtcConnection(stream);
      Object.defineProperty(connection.video, "requestVideoFrameCallback", {
        configurable: true,
        value: vi.fn((callback: VideoFrameRequestCallback) => {
          decodedFrame = callback;
          return 1;
        }),
      });
      return connection;
    });
    const hlsFailures: Array<(error: Error) => void> = [];
    const hlsFactory = vi.fn<ConnectionFactory>(
      async (_api, _entity, _signal, onFailure) => {
        hlsFailures.push(onFailure);
        return {
          video: document.createElement("video"),
          transport: "hls_mse",
          close: vi.fn(),
        };
      },
    );
    installTestMediaSessionManager(
      new MediaSessionManager(webRtcFactory, hlsFactory),
    );
    const view = createLiveView(createApi());
    document.body.append(view);

    await vi.waitFor(() =>
      expect(
        presentation(view)
          ?.shadowRoot?.querySelector(".source-indicator")
          ?.textContent?.trim(),
      ).toBe("HLS-LL · HLS.js"),
    );
    expect(webRtcFactory).toHaveBeenCalledOnce();

    hlsFailures[0](new Error("HLS interrupted"));
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(hlsFactory).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(webRtcFactory).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(presentation(view)?.webRtcVideo?.srcObject).toBe(stream),
    );
    expect(decodedFrame).toBeDefined();
    decodedFrame?.(0, {} as VideoFrameCallbackMetadata);

    await vi.waitFor(() =>
      expect(
        presentation(view)
          ?.shadowRoot?.querySelector(".source-indicator")
          ?.textContent?.trim(),
      ).toBe("WebRTC"),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(webRtcFactory).toHaveBeenCalledTimes(2);
  });

  it("keeps recovered HLS when the single WebRTC retry remains unavailable", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const webRtcFactory = vi.fn<ConnectionFactory>(async () => {
      throw new Error("WebRTC unavailable");
    });
    const hlsFailures: Array<(error: Error) => void> = [];
    const hlsFactory = vi.fn<ConnectionFactory>(
      async (_api, _entity, _signal, onFailure) => {
        hlsFailures.push(onFailure);
        return {
          video: document.createElement("video"),
          transport: "hls_mse",
          close: vi.fn(),
        };
      },
    );
    installTestMediaSessionManager(
      new MediaSessionManager(webRtcFactory, hlsFactory),
    );
    const view = createLiveView(createApi());
    document.body.append(view);

    await vi.waitFor(() =>
      expect(
        presentation(view)
          ?.shadowRoot?.querySelector(".source-indicator")
          ?.textContent?.trim(),
      ).toBe("HLS-LL · HLS.js"),
    );
    hlsFailures[0](new Error("HLS interrupted"));
    await vi.advanceTimersByTimeAsync(500);
    await vi.waitFor(() => expect(hlsFactory).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(webRtcFactory).toHaveBeenCalledTimes(2));

    await vi.waitFor(() =>
      expect(
        presentation(view)
          ?.shadowRoot?.querySelector(".source-indicator")
          ?.textContent?.trim(),
      ).toBe("HLS-LL · HLS.js"),
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(webRtcFactory).toHaveBeenCalledTimes(2);
  });

  it("keeps an explicit mute over an unmuted startup default across navigation", async () => {
    const { api, hlsVideo } = installHlsSession();
    const initial = createLiveView(api, true);
    document.body.append(initial);
    await vi.waitFor(() =>
      expect(
        presentation(initial)?.shadowRoot?.querySelector(
          ".fallback-host video",
        ),
      ).toBe(hlsVideo),
    );
    expect(hlsVideo.muted).toBe(false);

    toggleMute(initial);
    expect(hlsVideo.muted).toBe(true);
    expect(
      getMediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBe("muted");

    initial.remove();
    const returned = createLiveView(api, true);
    document.body.append(returned);
    await vi.waitFor(() =>
      expect(
        presentation(returned)?.shadowRoot?.querySelector(
          ".fallback-host video",
        ),
      ).toBe(hlsVideo),
    );
    expect(hlsVideo.muted).toBe(true);
  });

  it("keeps an explicit unmute over a muted startup default across navigation", async () => {
    const { api, hlsVideo } = installHlsSession();
    const initial = createLiveView(api);
    document.body.append(initial);
    await vi.waitFor(() =>
      expect(
        presentation(initial)?.shadowRoot?.querySelector(
          ".fallback-host video",
        ),
      ).toBe(hlsVideo),
    );
    expect(hlsVideo.muted).toBe(true);

    toggleMute(initial);
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));
    expect(
      getMediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBe("unmuted");

    initial.remove();
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(true));
    const returned = createLiveView(api);
    document.body.append(returned);
    await vi.waitFor(() =>
      expect(
        presentation(returned)?.shadowRoot?.querySelector(
          ".fallback-host video",
        ),
      ).toBe(hlsVideo),
    );
    expect(hlsVideo.muted).toBe(false);
  });

  it("temporarily unmutes an explicit mute for talk without changing preference", async () => {
    const { api, hlsVideo } = installHlsSession();
    const context = new CameraSessionContext();
    const view = createLiveView(api, true);
    view.cameraSession = context;
    document.body.append(view);
    await vi.waitFor(() =>
      expect(
        presentation(view)?.shadowRoot?.querySelector(".fallback-host video"),
      ).toBe(hlsVideo),
    );
    expect(hlsVideo.muted).toBe(false);
    toggleMute(view);
    expect(hlsVideo.muted).toBe(true);
    expect(
      getMediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBe("muted");

    context.session?.setTalkAudioActive(true);
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));
    expect(
      getMediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBe("muted");

    context.session?.setTalkAudioActive(false);
    expect(hlsVideo.muted).toBe(true);
    expect(
      getMediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBe("muted");
  });

  it("restores an explicit unmuted preference after talk ends", async () => {
    const { api, hlsVideo } = installHlsSession();
    const context = new CameraSessionContext();
    const view = createLiveView(api);
    view.cameraSession = context;
    document.body.append(view);
    await vi.waitFor(() =>
      expect(
        presentation(view)?.shadowRoot?.querySelector(".fallback-host video"),
      ).toBe(hlsVideo),
    );
    toggleMute(view);
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));

    context.session?.setTalkAudioActive(true);
    context.session?.setTalkAudioActive(false);

    expect(hlsVideo.muted).toBe(false);
    expect(
      getMediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBe("unmuted");
  });

  it("keeps a user mute made during talk over an auto-unmuted default", async () => {
    const { api, hlsVideo } = installHlsSession();
    const context = new CameraSessionContext();
    const view = createLiveView(api, true);
    view.cameraSession = context;
    document.body.append(view);
    await vi.waitFor(() =>
      expect(
        presentation(view)?.shadowRoot?.querySelector(".fallback-host video"),
      ).toBe(hlsVideo),
    );
    expect(hlsVideo.muted).toBe(false);

    context.session?.setTalkAudioActive(true);
    context.session?.setMuted(true);
    expect(hlsVideo.muted).toBe(true);

    context.session?.setTalkAudioActive(false);
    expect(hlsVideo.muted).toBe(true);
    expect(
      getMediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBe("muted");
  });

  it("temporarily mutes a hidden document without changing user intent", async () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const { api, hlsVideo } = installHlsSession();
    const view = createLiveView(api);
    document.body.append(view);
    await vi.waitFor(() =>
      expect(
        presentation(view)?.shadowRoot?.querySelector(".fallback-host video"),
      ).toBe(hlsVideo),
    );
    toggleMute(view);
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(hlsVideo.muted).toBe(true);
    expect(
      getMediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBe("unmuted");

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));
  });

  it("keeps an explicit unmute preference when autoplay is blocked", async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValueOnce()
      .mockRejectedValue(
        new DOMException("Playback blocked", "NotAllowedError"),
      );
    const hlsVideo = document.createElement("video");
    installTestMediaSessionManager(
      new MediaSessionManager(
        vi.fn<ConnectionFactory>(async () => ({ close: vi.fn() })),
        vi.fn<ConnectionFactory>(async () => ({
          video: hlsVideo,
          transport: "hls_mse",
          close: vi.fn(),
        })),
      ),
    );
    const view = createLiveView(createApi());
    document.body.append(view);
    await vi.waitFor(() =>
      expect(
        presentation(view)?.shadowRoot?.querySelector(".fallback-host video"),
      ).toBe(hlsVideo),
    );

    toggleMute(view);

    await vi.waitFor(() => expect(hlsVideo.muted).toBe(true));
    expect(play).toHaveBeenCalledTimes(3);
    expect(hlsVideo.muted).toBe(true);
    expect(
      getMediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBe("unmuted");
    await vi.waitFor(() =>
      expect(
        presentation(view)
          ?.shadowRoot?.querySelector("wzc-toast-region")
          ?.shadowRoot?.querySelector('[data-severity="warning"]')?.textContent,
      ).toContain("The browser blocked unmuted playback."),
    );
  });

  it("retries HLS muted when unmuted startup autoplay is blocked", async () => {
    const mutedAtPlay: boolean[] = [];
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      mutedAtPlay.push(this.muted);
      return this.muted
        ? Promise.resolve()
        : Promise.reject(
            new DOMException("Playback blocked", "NotAllowedError"),
          );
    });
    const hlsVideo = document.createElement("video");
    installTestMediaSessionManager(
      new MediaSessionManager(
        vi.fn<ConnectionFactory>(async () => ({ close: vi.fn() })),
        vi.fn<ConnectionFactory>(async () => ({
          video: hlsVideo,
          transport: "hls_mse",
          close: vi.fn(),
        })),
      ),
    );
    const view = createLiveView(createApi(), true);
    document.body.append(view);

    await vi.waitFor(() => expect(hlsVideo.muted).toBe(true));
    await vi.waitFor(() => expect(mutedAtPlay).toContain(true));
    expect(mutedAtPlay).toContain(false);
    expect(
      getMediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBeUndefined();
  });

  it("temporarily mutes page and app suspension without changing intent", async () => {
    const { api, hlsVideo } = installHlsSession();
    const view = createLiveView(api);
    document.body.append(view);
    await vi.waitFor(() =>
      expect(
        presentation(view)?.shadowRoot?.querySelector(".fallback-host video"),
      ).toBe(hlsVideo),
    );
    toggleMute(view);
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));

    const pageHide = new Event("pagehide");
    Object.defineProperty(pageHide, "persisted", { value: true });
    window.dispatchEvent(pageHide);
    expect(hlsVideo.muted).toBe(true);
    expect(
      getMediaSessionManager().getCameraMutePreference("camera.front"),
    ).toBe("unmuted");

    window.dispatchEvent(new Event("pageshow"));
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));
    document.dispatchEvent(new Event("freeze"));
    expect(hlsVideo.muted).toBe(true);
    document.dispatchEvent(new Event("resume"));
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));
  });

  it("uses the independent phone startup default on a detected iPhone", async () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1",
    );
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("iPhone");
    const { api, hlsVideo } = installHlsSession();
    const view = createLiveView(api, false, true);
    document.body.append(view);

    await vi.waitFor(() =>
      expect(
        presentation(view)?.shadowRoot?.querySelector(".fallback-host video"),
      ).toBe(hlsVideo),
    );
    expect(hlsVideo.muted).toBe(false);
  });

  it("uses the PC/tablet startup default on a narrow desktop", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(844);
    const { api, hlsVideo } = installHlsSession();
    const view = createLiveView(api, true, false);
    document.body.append(view);

    await vi.waitFor(() =>
      expect(
        presentation(view)?.shadowRoot?.querySelector(".fallback-host video"),
      ).toBe(hlsVideo),
    );
    expect(hlsVideo.muted).toBe(false);
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

function cameraItem(entityId: string) {
  return {
    available: true,
    connection: "home_assistant" as const,
    entityId,
    label: entityId,
    lowLatencyHls: true,
    startUnmutedPcTablet: false,
    startUnmutedPhone: false,
  };
}
