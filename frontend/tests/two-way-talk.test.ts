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

  it("keeps a visible spinner while the talk connection is pending", async () => {
    const originalMediaDevices = Object.getOwnPropertyDescriptor(
      navigator,
      "mediaDevices",
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(() => new Promise<MediaStream>(() => undefined)),
      },
    });
    try {
      const context = new CameraSessionContext();
      const element = document.createElement(
        "wzc-two-way-talk",
      ) as TwoWayTalkComponent;
      element.api = api(vi.fn().mockResolvedValue({ supported: true }));
      element.cameraSession = context;
      element.enabledCameraIds = ["camera.front"];
      document.body.append(element);
      context.publish({}, cameraSession(true));

      await vi.waitFor(() =>
        expect(
          element.shadowRoot?.querySelector("button.inactive"),
        ).not.toBeNull(),
      );
      element.shadowRoot
        ?.querySelector<HTMLButtonElement>("button.inactive")
        ?.click();
      await element.updateComplete;

      expect(
        element.shadowRoot?.querySelector(".connecting-indicator"),
      ).not.toBeNull();
    } finally {
      if (originalMediaDevices) {
        Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
      } else {
        Reflect.deleteProperty(navigator, "mediaDevices");
      }
    }
  });

  it("holds the shared overlay for pointer and keyboard interaction", async () => {
    const release = vi.fn();
    const holdOverlay = vi.fn(() => release);
    const context = new CameraSessionContext();
    const element = document.createElement(
      "wzc-two-way-talk",
    ) as TwoWayTalkComponent;
    element.api = api(vi.fn().mockResolvedValue({ supported: true }));
    element.cameraSession = context;
    element.enabledCameraIds = ["camera.front"];
    document.body.append(element);
    context.publish(
      {},
      {
        ...cameraSession(true),
        holdOverlay,
      },
    );
    await vi.waitFor(() =>
      expect(
        element.shadowRoot?.querySelector(".inactive-control"),
      ).not.toBeNull(),
    );

    const control = element.shadowRoot?.querySelector(".inactive-control");
    control?.dispatchEvent(new Event("pointerenter"));
    expect(holdOverlay).toHaveBeenCalledOnce();
    control?.dispatchEvent(new FocusEvent("focusin"));
    expect(holdOverlay).toHaveBeenCalledOnce();
    control?.dispatchEvent(new Event("pointerleave"));
    expect(release).not.toHaveBeenCalled();
    control?.dispatchEvent(new FocusEvent("focusout"));
    expect(release).toHaveBeenCalledOnce();

    control?.dispatchEvent(new Event("pointerenter"));
    expect(holdOverlay).toHaveBeenCalledTimes(2);
    control?.dispatchEvent(new Event("pointerleave"));
    expect(release).toHaveBeenCalledTimes(2);
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
