import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import {
  type ConnectionFactory,
  MediaSessionManager,
} from "../src/core/media-session-manager";
import type { CameraLiveView } from "../src/modules/camera/live-view";
import "../src/modules/camera/live-view";

function createLiveView(
  api: HomeAssistantApi,
  startUnmutedPcTablet = false,
  startUnmutedPhone = false,
): CameraLiveView {
  const view = document.createElement("watchzone-camera-live-view");
  view.api = api;
  view.available = true;
  view.startUnmutedPcTablet = startUnmutedPcTablet;
  view.startUnmutedPhone = startUnmutedPhone;
  view.entityId = "camera.front";
  return view;
}

function cameraControl(view: CameraLiveView): HTMLElement {
  const controls = view.shadowRoot?.querySelector<HTMLElement>(
    "watchzone-camera-controls",
  );
  if (!controls) throw new Error("Camera controls are not rendered");
  return controls;
}

function toggleMute(view: CameraLiveView): void {
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
  window.__appMediaSessionManager = new MediaSessionManager(
    vi.fn<ConnectionFactory>(async () => ({ close: vi.fn() })),
    vi.fn<ConnectionFactory>(async () => ({
      video: hlsVideo,
      transport: "hls_mse",
      close: vi.fn(),
    })),
  );
  return { api: createApi(), hlsVideo };
}

describe("camera presentation retention", () => {
  beforeEach(() => {
    vi.stubGlobal("RTCPeerConnection", class TestPeerConnection {});
  });

  afterEach(() => {
    window.__appMediaSessionManager?.closeAll();
    delete window.__appMediaSessionManager;
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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
    window.__appMediaSessionManager = new MediaSessionManager(
      webRtcFactory,
      hlsFactory,
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
      expect(preEditor.shadowRoot?.querySelector(".hls-host video")).toBe(
        hlsVideo,
      ),
    );
    expect(preEditor.shadowRoot?.querySelector(".generic-fallback")).toBeNull();
    expect(
      preEditor.shadowRoot
        ?.querySelector(".hls-host")
        ?.classList.contains("native-edge-isolation"),
    ).toBe(false);

    const editorPreview = createLiveView(api);
    document.body.append(editorPreview);
    await vi.waitFor(() =>
      expect(editorPreview.shadowRoot?.querySelector(".hls-host video")).toBe(
        hlsVideo,
      ),
    );
    expect(preEditor.shadowRoot?.querySelector(".hls-host video")).toBeNull();

    editorPreview.remove();
    await vi.waitFor(() =>
      expect(preEditor.shadowRoot?.querySelector(".hls-host video")).toBe(
        hlsVideo,
      ),
    );
    expect(hlsFactory).toHaveBeenCalledOnce();
    expect(webRtcFactory).toHaveBeenCalledOnce();
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
    window.__appMediaSessionManager = new MediaSessionManager(
      vi.fn<ConnectionFactory>(async () => new Promise(() => undefined)),
      hlsFactory,
    );
    const view = createLiveView(createApi(), true);
    document.body.append(view);

    await vi.waitFor(() =>
      expect(view.shadowRoot?.querySelector(".hls-host video")).toBe(hlsVideo),
    );
    expect(hlsFactory.mock.calls[0][5].initialMuted).toBe(false);
    expect(hlsVideo.muted).toBe(false);
    expect(hlsVideo.defaultMuted).toBe(false);
    expect(hlsVideo.parentElement?.hidden).toBe(false);
  });

  it("restores the proven WebRTC takeover when HLS wins first", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    const hlsVideo = document.createElement("video");
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    let resolveWebRtc:
      | ((connection: {
          stream: MediaStream;
          transport: "webrtc";
          close(): void;
        }) => void)
      | undefined;
    window.__appMediaSessionManager = new MediaSessionManager(
      vi.fn<ConnectionFactory>(
        () =>
          new Promise((resolve) => {
            resolveWebRtc = resolve;
          }),
      ),
      vi.fn<ConnectionFactory>(async () => ({
        video: hlsVideo,
        transport: "hls_mse",
        close: vi.fn(),
      })),
    );
    const view = createLiveView(createApi(), true);
    document.body.append(view);

    await vi.waitFor(() =>
      expect(view.shadowRoot?.querySelector(".hls-host video")).toBe(hlsVideo),
    );
    const webRtcVideo =
      view.shadowRoot?.querySelector<HTMLVideoElement>("video.webrtc");
    expect(webRtcVideo).toBeTruthy();
    expect(webRtcVideo?.autoplay).toBe(true);
    expect(webRtcVideo?.hidden).toBe(true);
    expect(hlsVideo.muted).toBe(false);

    resolveWebRtc?.({ stream, transport: "webrtc", close: vi.fn() });
    await vi.waitFor(() => expect(webRtcVideo?.srcObject).toBe(stream));
    webRtcVideo?.dispatchEvent(new Event("loadeddata"));

    await vi.waitFor(() => expect(webRtcVideo?.hidden).toBe(false));
    expect(view.shadowRoot?.querySelector(".hls-host video")).toBeNull();
    expect(webRtcVideo?.muted).toBe(false);

    toggleMute(view);
    expect(webRtcVideo?.muted).toBe(true);
    expect(
      window.__appMediaSessionManager.getCameraMutePreference("camera.front"),
    ).toBe("muted");
  });

  it("keeps an explicit mute over an unmuted startup default across navigation", async () => {
    const { api, hlsVideo } = installHlsSession();
    const initial = createLiveView(api, true);
    document.body.append(initial);
    await vi.waitFor(() =>
      expect(initial.shadowRoot?.querySelector(".hls-host video")).toBe(
        hlsVideo,
      ),
    );
    expect(hlsVideo.muted).toBe(false);

    toggleMute(initial);
    expect(hlsVideo.muted).toBe(true);
    expect(hlsVideo.defaultMuted).toBe(true);
    expect(
      window.__appMediaSessionManager?.getCameraMutePreference("camera.front"),
    ).toBe("muted");

    initial.remove();
    const returned = createLiveView(api, true);
    document.body.append(returned);
    await vi.waitFor(() =>
      expect(returned.shadowRoot?.querySelector(".hls-host video")).toBe(
        hlsVideo,
      ),
    );
    expect(hlsVideo.muted).toBe(true);
  });

  it("keeps an explicit unmute over a muted startup default across navigation", async () => {
    const { api, hlsVideo } = installHlsSession();
    const initial = createLiveView(api);
    document.body.append(initial);
    await vi.waitFor(() =>
      expect(initial.shadowRoot?.querySelector(".hls-host video")).toBe(
        hlsVideo,
      ),
    );
    expect(hlsVideo.muted).toBe(true);

    toggleMute(initial);
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));
    expect(
      window.__appMediaSessionManager?.getCameraMutePreference("camera.front"),
    ).toBe("unmuted");

    initial.remove();
    const returned = createLiveView(api);
    document.body.append(returned);
    await vi.waitFor(() =>
      expect(returned.shadowRoot?.querySelector(".hls-host video")).toBe(
        hlsVideo,
      ),
    );
    expect(hlsVideo.muted).toBe(false);
  });

  it("temporarily mutes a hidden document without changing user intent", async () => {
    const visibility = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const { api, hlsVideo } = installHlsSession();
    const view = createLiveView(api);
    document.body.append(view);
    await vi.waitFor(() =>
      expect(view.shadowRoot?.querySelector(".hls-host video")).toBe(hlsVideo),
    );
    toggleMute(view);
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));
    expect(hlsVideo.defaultMuted).toBe(false);

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(hlsVideo.muted).toBe(true);
    expect(hlsVideo.defaultMuted).toBe(false);
    expect(
      window.__appMediaSessionManager?.getCameraMutePreference("camera.front"),
    ).toBe("unmuted");

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));
  });

  it("keeps an explicit unmute preference when autoplay is blocked", async () => {
    const playbackMuteStates: boolean[] = [];
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockImplementation(function (this: HTMLMediaElement) {
        playbackMuteStates.push(this.muted);
        return this.muted
          ? Promise.resolve()
          : Promise.reject(
              new DOMException("Playback blocked", "NotAllowedError"),
            );
      });
    const hlsVideo = document.createElement("video");
    window.__appMediaSessionManager = new MediaSessionManager(
      vi.fn<ConnectionFactory>(async () => ({ close: vi.fn() })),
      vi.fn<ConnectionFactory>(async () => ({
        video: hlsVideo,
        transport: "hls_mse",
        close: vi.fn(),
      })),
    );
    const view = createLiveView(createApi());
    document.body.append(view);
    await vi.waitFor(() =>
      expect(view.shadowRoot?.querySelector(".hls-host video")).toBe(hlsVideo),
    );

    toggleMute(view);

    await vi.waitFor(() => expect(hlsVideo.muted).toBe(true));
    await vi.waitFor(() => expect(play).toHaveBeenCalledTimes(3));
    expect(playbackMuteStates).toEqual([true, false, true]);
    expect(
      window.__appMediaSessionManager?.getCameraMutePreference("camera.front"),
    ).toBe("unmuted");
    await vi.waitFor(() =>
      expect(
        view.shadowRoot?.querySelector("watchzone-toast")?.shadowRoot
          ?.textContent,
      ).toContain("The browser blocked unmuted playback."),
    );
  });

  it("falls back to playing muted when startup auto-unmute is blocked", async () => {
    const playbackMuteStates: boolean[] = [];
    vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      playbackMuteStates.push(this.muted);
      return this.muted
        ? Promise.resolve()
        : Promise.reject(
            new DOMException("Playback blocked", "NotAllowedError"),
          );
    });
    const hlsVideo = document.createElement("video");
    window.__appMediaSessionManager = new MediaSessionManager(
      vi.fn<ConnectionFactory>(async () => ({ close: vi.fn() })),
      vi.fn<ConnectionFactory>(async () => ({
        video: hlsVideo,
        transport: "hls_mse",
        close: vi.fn(),
      })),
    );
    const view = createLiveView(createApi(), true);
    document.body.append(view);

    await vi.waitFor(() => expect(hlsVideo.muted).toBe(true));
    await vi.waitFor(() =>
      expect(playbackMuteStates.slice(-2)).toEqual([false, true]),
    );
    expect(
      window.__appMediaSessionManager.getCameraMutePreference("camera.front"),
    ).toBeUndefined();
  });

  it("does not reinterpret a transient play interruption as autoplay denial", async () => {
    vi.spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValueOnce()
      .mockRejectedValue(
        new DOMException("Playback was interrupted", "AbortError"),
      );
    const hlsVideo = document.createElement("video");
    window.__appMediaSessionManager = new MediaSessionManager(
      vi.fn<ConnectionFactory>(async () => ({ close: vi.fn() })),
      vi.fn<ConnectionFactory>(async () => ({
        video: hlsVideo,
        transport: "hls_native",
        close: vi.fn(),
      })),
    );
    const view = createLiveView(createApi(), true);
    document.body.append(view);

    await vi.waitFor(() =>
      expect(view.shadowRoot?.querySelector(".hls-host video")).toBe(hlsVideo),
    );
    await vi.waitFor(() => expect(hlsVideo.muted).toBe(false));
    expect(cameraControl(view).shadowRoot?.textContent).not.toContain(
      "The browser blocked unmuted playback.",
    );
  });

  it("uses the desktop startup default even in a narrow card", async () => {
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(390);
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(844);
    const { api, hlsVideo } = installHlsSession();
    const view = createLiveView(api, true, false);
    document.body.append(view);

    await vi.waitFor(() =>
      expect(view.shadowRoot?.querySelector(".hls-host video")).toBe(hlsVideo),
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
