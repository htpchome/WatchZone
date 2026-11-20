import type { ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CAMERA_LIVE_PRESENTATION_TAG } from "../src/core/constants";
import "../src/stage/camera-presentation/live/presentation";
import type { CameraLivePresentation } from "../src/stage/camera-presentation/live/presentation";
import { ZoomController } from "../src/ui/zoom";
import { ZoomTransformController } from "../src/ui/zoom/transform.controller";
import {
  MEDIA_OVERLAY_HIDE_DELAY_MS,
  MediaOverlayVisibilityController,
} from "../src/ui/media-overlay-visibility.controller";

function createHost(): ReactiveControllerHost {
  return {
    addController: vi.fn(),
    removeController: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
}

function createIntegratedZoom(host: ReactiveControllerHost): {
  readonly controller: ZoomController;
  readonly overlay: MediaOverlayVisibilityController;
} {
  const overlay = new MediaOverlayVisibilityController(host);
  const controller = new ZoomController(host, {
    onActivation: (input) =>
      input === "touch" ? overlay.revealFromTouch() : overlay.reveal(),
    onTouchInteraction: () => overlay.revealFromTouch(),
  });
  return { controller, overlay };
}

function createSurface(height = 225): HTMLElement {
  const surface = document.createElement("div");
  Object.defineProperty(surface, "getBoundingClientRect", {
    value: () => ({
      bottom: height,
      height,
      left: 0,
      right: 400,
      top: 0,
      width: 400,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    }),
  });
  document.body.append(surface);
  return surface;
}

function pointerEvent(
  type: string,
  init: {
    readonly buttons?: number;
    readonly clientX: number;
    readonly clientY: number;
    readonly pointerId: number;
    readonly pointerType: "mouse" | "touch";
  },
): PointerEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as PointerEvent;
  for (const [key, value] of Object.entries({ button: 0, ...init })) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

function connectPointerEvents(
  surface: HTMLElement,
  controller: ZoomTransformController,
): void {
  surface.addEventListener("pointerdown", controller.handlePointerDown);
  surface.addEventListener("pointermove", controller.handlePointerMove);
  surface.addEventListener("pointerup", controller.handlePointerUp);
  surface.addEventListener("pointercancel", controller.handlePointerCancel);
  surface.addEventListener(
    "lostpointercapture",
    controller.handleLostPointerCapture,
  );
}

function tap(
  surface: HTMLElement,
  pointerType: "mouse" | "touch" = "mouse",
): void {
  surface.dispatchEvent(
    pointerEvent("pointerdown", {
      clientX: 200,
      clientY: 112.5,
      pointerId: 1,
      pointerType,
    }),
  );
  surface.dispatchEvent(
    pointerEvent("pointerup", {
      clientX: 200,
      clientY: 112.5,
      pointerId: 1,
      pointerType,
    }),
  );
  surface.dispatchEvent(
    pointerEvent("click", {
      clientX: 200,
      clientY: 112.5,
      pointerId: 1,
      pointerType,
    }),
  );
}

function doubleClick(surface: HTMLElement): void {
  surface.dispatchEvent(
    new MouseEvent("dblclick", {
      bubbles: true,
      button: 0,
      cancelable: true,
      clientX: 200,
      clientY: 112.5,
    }),
  );
}

function stubAnimationFrames(): Map<number, FrameRequestCallback> {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 1;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const frame = nextFrame++;
    frames.set(frame, callback);
    return frame;
  });
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => {
    frames.delete(frame);
  });
  return frames;
}

describe("camera media zoom", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("toggles between 1x and 2x with desktop double-click", () => {
    const surface = createSurface();
    const controller = new ZoomTransformController(createHost());
    controller.attach(surface);
    connectPointerEvents(surface, controller);
    surface.addEventListener("dblclick", controller.handleDoubleClick);

    doubleClick(surface);
    expect(controller.scale).toBe(2);
    expect(controller.zoomed).toBe(true);

    doubleClick(surface);
    expect(controller.scale).toBe(1);
  });

  it("applies one overlay contract to touch, zoom, pan, and native double-click", () => {
    vi.useFakeTimers();
    const surface = createSurface();
    const { controller, overlay } = createIntegratedZoom(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(400, 225);

    tap(surface, "touch");
    expect(overlay.visible).toBe(true);
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS);
    expect(overlay.visible).toBe(false);

    tap(surface, "touch");
    tap(surface, "touch");
    expect(controller.scale).toBe(2);
    expect(overlay.visible).toBe(true);

    vi.advanceTimersByTime(500);
    tap(surface, "touch");
    expect(overlay.visible).toBe(true);

    vi.advanceTimersByTime(500);
    tap(surface, "touch");
    tap(surface, "touch");
    expect(controller.scale).toBe(1);

    tap(surface, "touch");
    vi.advanceTimersByTime(500);
    tap(surface, "touch");
    expect(overlay.visible).toBe(true);
    vi.advanceTimersByTime(MEDIA_OVERLAY_HIDE_DELAY_MS - 1);
    expect(overlay.visible).toBe(true);
    vi.advanceTimersByTime(1);
    expect(overlay.visible).toBe(false);

    tap(surface, "touch");
    tap(surface, "touch");
    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 200,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 240,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    expect(overlay.visible).toBe(true);

    const doubleClick = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
    });
    surface.dispatchEvent(doubleClick);
    expect(doubleClick.defaultPrevented).toBe(true);
    expect(controller.scale).toBe(2);
    controller.hostDisconnected();
  });

  it("keeps zoom activation independent from optional presentation callbacks", () => {
    const surface = createSurface();
    const controller = new ZoomController(createHost());
    controller.attach(surface);

    tap(surface, "touch");
    tap(surface, "touch");

    expect(controller.scale).toBe(2);
    controller.hostDisconnected();
  });

  it("suppresses the native double-click that follows a completed click pair", () => {
    const surface = createSurface();
    const controller = new ZoomController(createHost());
    controller.attach(surface);

    tap(surface, "mouse");
    tap(surface, "mouse");
    expect(controller.scale).toBe(2);

    const nativeDoubleClick = new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      clientX: 200,
      clientY: 112.5,
    });
    surface.dispatchEvent(nativeDoubleClick);

    expect(nativeDoubleClick.defaultPrevented).toBe(true);
    expect(controller.scale).toBe(2);
    controller.hostDisconnected();
  });

  it("does not interpret a control touch as a media gesture", () => {
    const surface = createSurface();
    const button = document.createElement("button");
    surface.append(button);
    const controller = new ZoomController(createHost());
    controller.attach(surface);
    const activated = vi.fn();
    button.addEventListener("click", activated);

    tap(button, "touch");

    expect(activated).toHaveBeenCalledOnce();
    expect(controller.scale).toBe(1);
    controller.hostDisconnected();
  });

  it("pinches in and back to 1x through the shared media touch owner", () => {
    const surface = createSurface();
    const onTouchInteraction = vi.fn();
    const controller = new ZoomController(createHost(), {
      onTouchInteraction,
    });
    controller.attach(surface);

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 150,
        clientY: 112.5,
        pointerId: 1,
        pointerType: "touch",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 250,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 350,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    expect(controller.scale).toBe(2);
    expect(onTouchInteraction).toHaveBeenCalled();

    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 250,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    expect(controller.scale).toBe(1);
  });

  it("pans with one touch only while media is zoomed", () => {
    const surface = createSurface();
    const controller = new ZoomController(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(400, 225);
    tap(surface, "touch");
    tap(surface, "touch");

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 200,
        clientY: 112.5,
        pointerId: 4,
        pointerType: "touch",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 250,
        clientY: 140,
        pointerId: 4,
        pointerType: "touch",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointerup", {
        clientX: 250,
        clientY: 140,
        pointerId: 4,
        pointerType: "touch",
      }),
    );

    expect(surface.style.transform).not.toContain("translate3d(0px, 0px, 0)");
  });

  it("coalesces pointer pan presentation updates and flushes the final state", () => {
    const frames = stubAnimationFrames();
    const host = createHost();
    const requestUpdate = vi.mocked(host.requestUpdate);
    const surface = createSurface();
    const presentationTarget = document.createElement("video");
    surface.append(presentationTarget);
    const controller = new ZoomTransformController(host);
    controller.attach(surface, presentationTarget);
    controller.setMediaDimensions(400, 225);
    connectPointerEvents(surface, controller);
    controller.toggleAt(200, 112.5);
    requestUpdate.mockClear();

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        buttons: 1,
        clientX: 200,
        clientY: 112.5,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    requestUpdate.mockClear();
    for (const clientX of [220, 240, 260]) {
      surface.dispatchEvent(
        pointerEvent("pointermove", {
          buttons: 1,
          clientX,
          clientY: 112.5,
          pointerId: 1,
          pointerType: "mouse",
        }),
      );
    }

    expect(requestUpdate).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    expect(controller.transform).toContain("translate3d(60px, 0px, 0)");
    expect(presentationTarget.style.transform).toContain(
      "translate3d(0px, 0px, 0)",
    );

    const scheduledPan = [...frames.values()][0];
    frames.clear();
    scheduledPan?.(performance.now());

    expect(presentationTarget.style.transform).toContain(
      "translate3d(60px, 0px, 0)",
    );
    expect(requestUpdate).not.toHaveBeenCalled();

    surface.dispatchEvent(
      pointerEvent("pointerup", {
        buttons: 0,
        clientX: 260,
        clientY: 112.5,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );

    expect(frames.size).toBe(0);
    expect(requestUpdate).toHaveBeenCalledOnce();
    expect(controller.transform).toContain("translate3d(60px, 0px, 0)");
  });

  it("coalesces pinch zoom presentation updates and flushes the final scale", () => {
    const frames = stubAnimationFrames();
    const host = createHost();
    const requestUpdate = vi.mocked(host.requestUpdate);
    const surface = createSurface();
    const presentationTarget = document.createElement("video");
    surface.append(presentationTarget);
    const controller = new ZoomTransformController(host);
    controller.attach(surface, presentationTarget);
    connectPointerEvents(surface, controller);

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 150,
        clientY: 112.5,
        pointerId: 1,
        pointerType: "touch",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 250,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    requestUpdate.mockClear();
    for (const clientX of [300, 350, 400]) {
      surface.dispatchEvent(
        pointerEvent("pointermove", {
          clientX,
          clientY: 112.5,
          pointerId: 2,
          pointerType: "touch",
        }),
      );
    }

    expect(requestUpdate).not.toHaveBeenCalled();
    expect(frames.size).toBe(1);
    expect(controller.scale).toBe(2.5);

    const scheduledPinch = [...frames.values()][0];
    frames.clear();
    scheduledPinch?.(performance.now());

    expect(presentationTarget.style.transform).toContain("scale(2.5)");
    expect(requestUpdate).not.toHaveBeenCalled();

    surface.dispatchEvent(
      pointerEvent("pointerup", {
        clientX: 400,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );

    expect(frames.size).toBe(0);
    expect(requestUpdate).toHaveBeenCalledOnce();
    expect(controller.scale).toBe(2.5);
  });

  it("cancels a pending pan presentation update when disconnected", () => {
    const frames = stubAnimationFrames();
    const host = createHost();
    const requestUpdate = vi.mocked(host.requestUpdate);
    const surface = createSurface();
    const controller = new ZoomTransformController(host);
    controller.attach(surface);
    connectPointerEvents(surface, controller);
    controller.toggleAt(200, 112.5);
    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        buttons: 1,
        clientX: 200,
        clientY: 112.5,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    requestUpdate.mockClear();
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        buttons: 1,
        clientX: 240,
        clientY: 112.5,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );

    expect(frames.size).toBe(1);
    controller.hostDisconnected();
    expect(frames.size).toBe(0);
    expect(requestUpdate).not.toHaveBeenCalled();
  });

  it("recovers overlay interaction when backgrounding interrupts a pan", () => {
    const surface = createSurface(400);
    const controller = new ZoomController(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(400, 300);
    controller.setBasePresentationScale(4 / 3);

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        buttons: 1,
        clientX: 200,
        clientY: 200,
        pointerId: 7,
        pointerType: "mouse",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        buttons: 1,
        clientX: 240,
        clientY: 200,
        pointerId: 7,
        pointerType: "mouse",
      }),
    );
    expect(controller.interacting).toBe(true);

    window.dispatchEvent(new Event("blur"));
    expect(controller.interacting).toBe(false);
    expect(controller.pannable).toBe(true);

    surface.dispatchEvent(
      pointerEvent("pointermove", {
        buttons: 0,
        clientX: 250,
        clientY: 200,
        pointerId: 8,
        pointerType: "mouse",
      }),
    );
  });

  it("resets zoom across presentation ownership", () => {
    const surface = createSurface(400);
    const controller = new ZoomController(createHost());
    controller.attach(surface);

    doubleClick(surface);
    expect(controller.scale).toBe(2);
    controller.setActive(false);
    expect(controller.scale).toBe(1);
    controller.setActive(true);
  });

  it("self-heals a stranded gesture when an unpressed pointer returns", () => {
    const surface = createSurface(400);
    const controller = new ZoomController(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(400, 300);
    controller.setBasePresentationScale(4 / 3);

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        buttons: 1,
        clientX: 200,
        clientY: 200,
        pointerId: 9,
        pointerType: "mouse",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        buttons: 1,
        clientX: 240,
        clientY: 200,
        pointerId: 9,
        pointerType: "mouse",
      }),
    );
    expect(controller.interacting).toBe(true);

    surface.dispatchEvent(
      pointerEvent("pointermove", {
        buttons: 0,
        clientX: 260,
        clientY: 200,
        pointerId: 10,
        pointerType: "mouse",
      }),
    );
    expect(controller.interacting).toBe(false);
  });

  it("dismisses live overlays when pointer or touch starts outside the video", () => {
    vi.useFakeTimers();
    const host = createHost();
    const surface = createSurface();
    const outside = document.createElement("button");
    document.body.append(surface, outside);
    const overlay = new MediaOverlayVisibilityController(host, {
      dismissOnOutsidePointer: true,
    });
    overlay.hostConnected();
    overlay.attach(surface);

    overlay.reveal();
    outside.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 500,
        clientY: 300,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    vi.runOnlyPendingTimers();
    expect(overlay.visible).toBe(false);

    overlay.reveal();
    outside.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 500,
        clientY: 300,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    vi.runOnlyPendingTimers();
    expect(overlay.visible).toBe(false);

    overlay.reveal();
    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 200,
        clientY: 112.5,
        pointerId: 3,
        pointerType: "mouse",
      }),
    );
    expect(overlay.visible).toBe(true);
    overlay.hostDisconnected();
  });

  it("does not treat a completed pan as part of a double activation", () => {
    const surface = createSurface();
    const controller = new ZoomTransformController(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(400, 225);
    connectPointerEvents(surface, controller);
    controller.handleDoubleClick(
      new MouseEvent("dblclick", { clientX: 200, clientY: 112.5 }),
    );
    expect(controller.scale).toBe(2);

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 200,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 240,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointerup", {
        clientX: 240,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    tap(surface, "touch");
    expect(controller.scale).toBe(2);
  });

  it("zooms discrete wheels without consuming smooth scroll or native pinch", () => {
    const surface = createSurface();
    const controller = new ZoomTransformController(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(400, 225);
    surface.addEventListener("wheel", controller.handleWheel);

    const smoothScroll = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaY: -12,
    });
    surface.dispatchEvent(smoothScroll);
    expect(smoothScroll.defaultPrevented).toBe(false);
    expect(controller.scale).toBe(1);

    const mouseWheel = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaY: -100,
    });
    surface.dispatchEvent(mouseWheel);
    expect(mouseWheel.defaultPrevented).toBe(true);
    expect(controller.scale).toBe(1.25);

    const touchpadPinch = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      deltaMode: 0,
      deltaY: -20,
    });
    surface.dispatchEvent(touchpadPinch);
    expect(touchpadPinch.defaultPrevented).toBe(false);
    expect(controller.scale).toBe(1.25);

    const macNativeGesture = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: 0,
      deltaY: -100,
      metaKey: true,
    });
    surface.dispatchEvent(macNativeGesture);
    expect(macNativeGesture.defaultPrevented).toBe(false);
    expect(controller.scale).toBe(1.25);
  });

  it("clamps pinch zoom to 3x and drag pan to the media bounds", () => {
    const surface = createSurface();
    const controller = new ZoomTransformController(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(400, 225);
    connectPointerEvents(surface, controller);

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 150,
        clientY: 112.5,
        pointerId: 1,
        pointerType: "touch",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 250,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 500,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    expect(controller.scale).toBe(3);

    surface.dispatchEvent(
      pointerEvent("pointerup", {
        clientX: 500,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "touch",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointerup", {
        clientX: 150,
        clientY: 112.5,
        pointerId: 1,
        pointerType: "touch",
      }),
    );

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 200,
        clientY: 112.5,
        pointerId: 3,
        pointerType: "mouse",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 1200,
        clientY: 900,
        pointerId: 3,
        pointerType: "mouse",
      }),
    );
    expect(controller.transform).toContain("translate3d(400px, 225px, 0)");
  });

  it("keeps unknown media centered until safe pan bounds are available", () => {
    const surface = createSurface();
    const controller = new ZoomTransformController(createHost());
    controller.attach(surface);
    connectPointerEvents(surface, controller);

    controller.toggleAt(200, 112.5);
    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 200,
        clientY: 112.5,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 800,
        clientY: 600,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    expect(controller.transform).toContain("translate3d(0px, 0px, 0)");

    controller.setMediaDimensions(400, 225);
    surface.dispatchEvent(
      pointerEvent("pointerup", {
        clientX: 800,
        clientY: 600,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 200,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "mouse",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 800,
        clientY: 600,
        pointerId: 2,
        pointerType: "mouse",
      }),
    );
    expect(controller.transform).toContain("translate3d(200px, 112.5px, 0)");
  });

  it("pans a stage-created crop before the user adds display zoom", () => {
    const surface = createSurface(400);
    const controller = new ZoomTransformController(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(400, 300);
    controller.setBasePresentationScale(4 / 3);
    connectPointerEvents(surface, controller);

    expect(controller.scale).toBe(1);
    expect(controller.zoomed).toBe(false);
    expect(controller.pannable).toBe(true);
    expect(controller.transform).toContain("scale(1.3333333333333333)");

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 200,
        clientY: 200,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 400,
        clientY: 400,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    expect(controller.transform).toMatch(/translate3d\(66\.6\d*px, 0px, 0\)/);

    controller.setBasePresentationScale(1);
    expect(controller.pannable).toBe(false);
    expect(controller.transform).toBe("translate3d(0px, 0px, 0) scale(1)");
  });

  it("keeps intrinsic presentation centered without a compensating transform", () => {
    const surface = createSurface();
    const controller = new ZoomTransformController(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(1600, 900);
    controller.setPresentationHeightRatio(0.8);
    connectPointerEvents(surface, controller);

    expect(controller.transform).toBe("translate3d(0px, 0px, 0) scale(1)");
    expect(
      surface.style.getPropertyValue("--wzc-zoom-media-aspect-ratio"),
    ).toBe(String(16 / 9));

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 200,
        clientY: 112.5,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 200,
        clientY: 600,
        pointerId: 1,
        pointerType: "mouse",
      }),
    );

    expect(controller.transform).toContain("translate3d(0px, 0px, 0)");
  });

  it("preserves the source focal point while presentation crop changes", () => {
    const surface = createSurface();
    const controller = new ZoomTransformController(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(1600, 900);
    controller.setPresentationHeightRatio(9 / 16);
    controller.toggleAt(100, 112.5);

    expect(controller.transform).toContain(
      "translate3d(100px, 0px, 0) scale(2)",
    );

    controller.setPresentationHeightRatio(0.8);

    expect(controller.transform).toContain(
      `translate3d(${100 * (0.8 / (9 / 16))}px, 0px, 0)`,
    );
    expect(controller.transform).toContain("scale(2)");
  });

  it("resets zoom when camera identity changes", () => {
    const surface = createSurface();
    const controller = new ZoomTransformController(createHost());
    controller.attach(surface);
    connectPointerEvents(surface, controller);
    controller.configure("camera.front");
    controller.handleDoubleClick(
      new MouseEvent("dblclick", { clientX: 200, clientY: 112.5 }),
    );
    expect(controller.scale).toBe(2);

    controller.configure("camera.back");
    expect(controller.scale).toBe(1);
  });

  it("supports keyboard zoom, bounded pan, and reset", () => {
    const surface = createSurface();
    const controller = new ZoomTransformController(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(400, 225);

    const zoom = new KeyboardEvent("keydown", {
      cancelable: true,
      key: "Enter",
    });
    controller.handleKeyDown(zoom);
    expect(zoom.defaultPrevented).toBe(true);
    expect(controller.scale).toBe(2);

    const pan = new KeyboardEvent("keydown", {
      cancelable: true,
      key: "ArrowLeft",
    });
    controller.handleKeyDown(pan);
    expect(pan.defaultPrevented).toBe(true);
    expect(controller.transform).not.toContain("translate3d(0px, 0px, 0)");

    const reset = new KeyboardEvent("keydown", {
      cancelable: true,
      key: "Escape",
    });
    controller.handleKeyDown(reset);
    expect(reset.defaultPrevented).toBe(true);
    expect(controller.scale).toBe(1);
  });

  it("returns zoom and pan continuously with stage-resize progress", () => {
    const surface = createSurface();
    const controller = new ZoomTransformController(createHost());
    controller.attach(surface);
    controller.setMediaDimensions(400, 225);
    connectPointerEvents(surface, controller);
    controller.handleDoubleClick(
      new MouseEvent("dblclick", { clientX: 200, clientY: 112.5 }),
    );

    surface.dispatchEvent(
      pointerEvent("pointerdown", {
        clientX: 200,
        clientY: 112.5,
        pointerId: 2,
        pointerType: "mouse",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointermove", {
        clientX: 300,
        clientY: 160,
        pointerId: 2,
        pointerType: "mouse",
      }),
    );
    surface.dispatchEvent(
      pointerEvent("pointerup", {
        clientX: 300,
        clientY: 160,
        pointerId: 2,
        pointerType: "mouse",
      }),
    );
    expect(controller.transform).not.toContain("translate3d(0px, 0px, 0)");

    controller.beginStageResizeReturn();
    controller.updateStageResizeReturn(0.5);
    expect(controller.scale).toBe(1.5);
    expect(controller.transform).toContain("scale(1.5)");
    expect(controller.stageResizeActive).toBe(true);

    controller.updateStageResizeReturn(0.25);
    expect(controller.scale).toBe(1.5);

    controller.updateStageResizeReturn(1);
    expect(controller.transform).toBe("translate3d(0px, 0px, 0) scale(1)");
    controller.endStageResizeReturn();
    expect(controller.scale).toBe(1);
    expect(controller.stageResizeActive).toBe(false);
  });

  it("transforms fallback and live media without transforming overlays", async () => {
    const presentation = document.createElement(
      CAMERA_LIVE_PRESENTATION_TAG,
    ) as CameraLivePresentation;
    presentation.posterUrl = "/poster.jpg";
    presentation.zoomKey = "camera.front";
    document.body.append(presentation);
    await presentation.updateComplete;

    const surface = presentation.shadowRoot?.querySelector(".media-surface");
    expect(surface?.querySelector(".fallback-image")).not.toBeNull();
    expect(surface?.querySelector(".fallback-host")).not.toBeNull();
    expect(surface?.querySelector(".webrtc-host")).not.toBeNull();
    expect(surface?.querySelector("wzc-toast-region")).toBeNull();
    expect(
      presentation.shadowRoot?.querySelector("wzc-toast-region"),
    ).not.toBeNull();
  });
});
