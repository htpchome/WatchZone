import type { ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CAMERA_LIVE_PRESENTATION_TAG } from "../src/core/constants";
import "../src/modules/camera/live/presentation";
import type { CameraLivePresentation } from "../src/modules/camera/live/presentation";
import { CameraZoomController } from "../src/modules/camera/live/zoom.controller";

function createHost(): ReactiveControllerHost {
  return {
    addController: vi.fn(),
    removeController: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
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
  controller: CameraZoomController,
): void {
  surface.addEventListener("pointerdown", controller.handlePointerDown);
  surface.addEventListener("pointermove", controller.handlePointerMove);
  surface.addEventListener("pointerup", controller.handlePointerUp);
  surface.addEventListener("pointercancel", controller.handlePointerCancel);
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
}

describe("camera media zoom", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("toggles between 1x and 2x with double-click or double-tap", () => {
    const surface = createSurface();
    const controller = new CameraZoomController(createHost());
    controller.observe(surface);
    connectPointerEvents(surface, controller);

    tap(surface);
    expect(controller.scale).toBe(1);
    tap(surface);
    expect(controller.scale).toBe(2);
    expect(controller.zoomed).toBe(true);

    tap(surface, "touch");
    expect(controller.scale).toBe(2);
    tap(surface, "touch");
    expect(controller.scale).toBe(1);
    expect(controller.transform).toBe("translate3d(0px, 0px, 0) scale(1)");
  });

  it("does not treat a completed pan as part of a double activation", () => {
    const surface = createSurface();
    const controller = new CameraZoomController(createHost());
    controller.observe(surface);
    connectPointerEvents(surface, controller);
    tap(surface);
    tap(surface);
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
    const controller = new CameraZoomController(createHost());
    controller.observe(surface);
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
    const controller = new CameraZoomController(createHost());
    controller.observe(surface);
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

  it("pans a stage-created crop before the user adds display zoom", () => {
    const surface = createSurface(400);
    const controller = new CameraZoomController(createHost());
    controller.observe(surface);
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

  it("resets zoom when camera identity changes", () => {
    const surface = createSurface();
    const controller = new CameraZoomController(createHost());
    controller.observe(surface);
    connectPointerEvents(surface, controller);
    controller.configure("camera.front");
    tap(surface);
    tap(surface);
    expect(controller.scale).toBe(2);

    controller.configure("camera.back");
    expect(controller.scale).toBe(1);
  });

  it("supports keyboard zoom, bounded pan, and reset", () => {
    const surface = createSurface();
    const controller = new CameraZoomController(createHost());
    controller.observe(surface);

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
    const controller = new CameraZoomController(createHost());
    controller.observe(surface);
    connectPointerEvents(surface, controller);
    tap(surface);
    tap(surface);

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
    expect(surface?.querySelector(".hls-host")).not.toBeNull();
    expect(surface?.querySelector("video.webrtc")).not.toBeNull();
    expect(surface?.querySelector("wzc-toast-region")).toBeNull();
    expect(
      presentation.shadowRoot?.querySelector("wzc-toast-region"),
    ).not.toBeNull();
  });
});
