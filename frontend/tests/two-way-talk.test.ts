import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraSessionContext } from "../src/core/camera-session-context";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { TwoWayTalkComponent } from "../src/components/two-way-talk/two-way-talk";
import "../src/components/two-way-talk/two-way-talk";

describe("two-way-talk component", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("uses the active-camera context without repeating capability requests", async () => {
    const callWS = vi.fn().mockResolvedValue({ supported: true });
    const context = new CameraSessionContext();
    const owner = {};
    const element = document.createElement(
      "wzc-two-way-talk",
    ) as TwoWayTalkComponent;
    element.api = api(callWS);
    element.cameraSession = context;
    element.enabledCameraIds = ["camera.front"];
    document.body.append(element);
    context.publish(owner, cameraSession(true));

    await vi.waitFor(() =>
      expect(
        element.shadowRoot?.querySelector(".inactive-control.visible"),
      ).not.toBeNull(),
    );
    context.publish(owner, cameraSession(false));
    await element.updateComplete;

    expect(callWS).toHaveBeenCalledOnce();
    expect(
      element.shadowRoot?.querySelector(".inactive-control.visible"),
    ).toBeNull();
    expect(
      element.shadowRoot?.querySelector(".inactive-control"),
    ).not.toBeNull();
  });
});

function cameraSession(overlayVisible: boolean) {
  return {
    available: true,
    entityId: "camera.front",
    muted: true,
    overlayVisible,
    holdOverlay: vi.fn(() => vi.fn()),
    revealOverlay: vi.fn(),
    setMuted: vi.fn(),
    setTalkAudioActive: vi.fn(),
  };
}

function api(callWS: HomeAssistantApi["callWS"]): HomeAssistantApi {
  return {
    identity: { subscribeMessage: vi.fn() },
    callWS,
    resolveUrl: (path) => path,
    subscribeMessage: vi.fn(),
  };
}
