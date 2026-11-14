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

  it("owns a visible touch press without dismissing the live overlay", async () => {
    const callWS = vi.fn().mockResolvedValue({ supported: true });
    const context = new CameraSessionContext();
    const element = document.createElement(
      "wzc-two-way-talk",
    ) as TwoWayTalkComponent;
    element.api = api(callWS);
    element.cameraSession = context;
    element.cameras = [
      { connection: "home_assistant" as const, entityId: "camera.front" },
    ];
    document.body.append(element);
    context.publish({}, cameraSession(true));

    await vi.waitFor(() =>
      expect(
        element.shadowRoot?.querySelector("button[data-talk-action=connect]"),
      ).not.toBeNull(),
    );
    const start = vi.fn();
    (
      element as unknown as {
        _session: { start(): Promise<void> };
      }
    )._session.start = start;
    const button = element.shadowRoot?.querySelector<HTMLButtonElement>(
      "button[data-talk-action=connect]",
    );
    expect(button).toBeDefined();
    if (!button) return;
    Object.assign(button, {
      hasPointerCapture: vi.fn(() => false),
      releasePointerCapture: vi.fn(),
      setPointerCapture: vi.fn(),
    });
    const outsidePointer = vi.fn();
    document.addEventListener("pointerdown", outsidePointer);

    button.dispatchEvent(touchPointerEvent("pointerdown", 1));
    button.dispatchEvent(touchPointerEvent("pointerup", 1));

    document.removeEventListener("pointerdown", outsidePointer);
    expect(outsidePointer).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledOnce();
  });
});

function touchPointerEvent(type: string, pointerId: number): PointerEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  Object.defineProperties(event, {
    button: { value: 0 },
    isPrimary: { value: true },
    pointerId: { value: pointerId },
    pointerType: { value: "touch" },
  });
  return event as PointerEvent;
}

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
