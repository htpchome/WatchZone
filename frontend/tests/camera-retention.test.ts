import { afterEach, describe, expect, it, vi } from "vitest";

import type { HomeAssistantApi } from "../src/core/home-assistant";
import {
  type ConnectionFactory,
  MediaSessionManager,
} from "../src/core/media-session-manager";
import type { WatchZoneCameraLiveView } from "../src/modules/camera/live-view";
import "../src/modules/camera/live-view";

function createLiveView(api: HomeAssistantApi): WatchZoneCameraLiveView {
  const view = document.createElement("watchzone-camera-live-view");
  view.api = api;
  view.available = true;
  view.entityId = "camera.front";
  return view;
}

describe("camera presentation retention", () => {
  afterEach(() => {
    window.__watchZoneMediaSessionManager?.closeAll();
    delete window.__watchZoneMediaSessionManager;
    document.body.replaceChildren();
    vi.restoreAllMocks();
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
    window.__watchZoneMediaSessionManager = new MediaSessionManager(
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
});
