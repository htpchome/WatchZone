import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraSessionContext } from "../src/stage/camera-session-context";
import type { HomeAssistantApi } from "../src/core/home-assistant";
import type { TwoWayTalkComponent } from "../src/stage/components/two-way-talk/two-way-talk";
import "../src/stage/components/two-way-talk/two-way-talk";

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
    element.cameras = [
      { connection: "home_assistant" as const, entityId: "camera.front" },
    ];
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

  it("holds the shared overlay while the inactive microphone is hovered", async () => {
    const callWS = vi.fn().mockResolvedValue({ supported: true });
    const context = new CameraSessionContext();
    const release = vi.fn();
    const session = cameraSession(true);
    session.holdOverlay.mockReturnValue(release);
    const element = document.createElement(
      "wzc-two-way-talk",
    ) as TwoWayTalkComponent;
    element.api = api(callWS);
    element.cameraSession = context;
    element.cameras = [
      { connection: "home_assistant" as const, entityId: "camera.front" },
    ];
    document.body.append(element);
    context.publish({}, session);

    await vi.waitFor(() =>
      expect(
        element.shadowRoot?.querySelector(".inactive-control.visible"),
      ).not.toBeNull(),
    );
    const control = element.shadowRoot?.querySelector(
      ".inactive-control",
    ) as HTMLElement;
    control.dispatchEvent(new Event("pointerenter"));
    expect(session.holdOverlay).toHaveBeenCalledOnce();
    expect(session.revealOverlay).toHaveBeenCalledOnce();
    control.dispatchEvent(new Event("pointerleave"));
    expect(release).toHaveBeenCalledOnce();
  });
});

function cameraSession(overlayVisible: boolean) {
  return {
    available: true,
    connection: "home_assistant" as const,
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
