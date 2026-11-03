import type { ReactiveControllerHost } from "lit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraStageResizeController } from "../src/modules/camera/stage-resize.controller";

function createHost(): ReactiveControllerHost {
  return {
    addController: vi.fn(),
    removeController: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
}

function createElements(): {
  readonly handle: HTMLButtonElement;
  readonly stage: HTMLElement;
} {
  const stage = document.createElement("div");
  const handle = document.createElement("button");
  Object.defineProperty(stage, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      bottom: 225,
      height: 225,
      left: 0,
      right: 400,
      top: 0,
      width: 400,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    }),
  });
  document.body.append(stage, handle);
  return { handle, stage };
}

function pointerEvent(
  type: string,
  init: {
    readonly clientX: number;
    readonly clientY: number;
    readonly pointerId?: number;
    readonly pointerType?: "mouse" | "touch";
  },
): PointerEvent {
  const event = new Event(type, {
    bubbles: true,
    cancelable: true,
  }) as PointerEvent;
  for (const [key, value] of Object.entries({
    button: 0,
    pointerId: 1,
    pointerType: "mouse",
    ...init,
  })) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

function connectPointerEvents(
  handle: HTMLButtonElement,
  controller: CameraStageResizeController,
): void {
  handle.addEventListener("pointerdown", controller.handlePointerDown);
  handle.addEventListener("pointermove", controller.handlePointerMove);
  handle.addEventListener("pointerup", controller.handlePointerUp);
  handle.addEventListener("pointercancel", controller.handlePointerCancel);
}

describe("camera stage resizing", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("reveals a 4:3 source before switching to centered crop", () => {
    const { handle, stage } = createElements();
    const controller = new CameraStageResizeController(createHost());
    controller.observe(stage, handle);
    controller.setMediaDimensions(400, 300);
    connectPointerEvents(handle, controller);

    handle.dispatchEvent(
      pointerEvent("pointerdown", { clientX: 200, clientY: 100 }),
    );
    handle.dispatchEvent(
      pointerEvent("pointermove", { clientX: 200, clientY: 175 }),
    );
    expect(
      Number(
        stage.style.getPropertyValue("--wzc-camera-stage-runtime-aspect-ratio"),
      ),
    ).toBeCloseTo(4 / 3);
    expect(stage.style.getPropertyValue("--wzc-live-fit")).toBe("");

    handle.dispatchEvent(
      pointerEvent("pointermove", { clientX: 200, clientY: 200 }),
    );
    expect(stage.style.getPropertyValue("--wzc-live-fit")).toBe("cover");
  });

  it("clamps stage height between 16:9 and 1:1", () => {
    const { handle, stage } = createElements();
    const controller = new CameraStageResizeController(createHost());
    controller.observe(stage, handle);
    connectPointerEvents(handle, controller);

    handle.dispatchEvent(
      pointerEvent("pointerdown", { clientX: 200, clientY: 100 }),
    );
    handle.dispatchEvent(
      pointerEvent("pointermove", { clientX: 200, clientY: 1000 }),
    );
    expect(
      stage.style.getPropertyValue("--wzc-camera-stage-runtime-aspect-ratio"),
    ).toBe("1");

    handle.dispatchEvent(
      pointerEvent("pointermove", { clientX: 200, clientY: -1000 }),
    );
    expect(
      Number(
        stage.style.getPropertyValue("--wzc-camera-stage-runtime-aspect-ratio"),
      ),
    ).toBeCloseTo(16 / 9);
  });

  it("reports continuous progress while returning toward default height", () => {
    const { handle, stage } = createElements();
    let stageHeight = 225;
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: stageHeight,
        height: stageHeight,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });
    const interactions: Array<
      | { readonly phase: "start" }
      | { readonly phase: "update"; readonly returnProgress: number }
      | { readonly phase: "end" }
    > = [];
    const controller = new CameraStageResizeController(createHost(), (event) =>
      interactions.push(event),
    );
    controller.observe(stage, handle);
    controller.handleKeyDown(
      new KeyboardEvent("keydown", { cancelable: true, key: "End" }),
    );
    stageHeight = 400;
    connectPointerEvents(handle, controller);

    handle.dispatchEvent(
      pointerEvent("pointerdown", { clientX: 200, clientY: 400 }),
    );
    stageHeight = 312.5;
    handle.dispatchEvent(
      pointerEvent("pointermove", { clientX: 200, clientY: 312.5 }),
    );
    handle.dispatchEvent(
      pointerEvent("pointerup", { clientX: 200, clientY: 312.5 }),
    );

    expect(interactions[0]).toEqual({ phase: "start" });
    expect(interactions[1]?.phase).toBe("update");
    expect(
      interactions[1]?.phase === "update"
        ? interactions[1].returnProgress
        : undefined,
    ).toBeCloseTo(0.5);
    expect(interactions.at(-1)).toEqual({ phase: "end" });
  });

  it("supports keyboard resizing and resets on Home", () => {
    const { handle, stage } = createElements();
    const controller = new CameraStageResizeController(createHost());
    controller.observe(stage, handle);

    const grow = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "ArrowDown",
    });
    controller.handleKeyDown(grow);
    expect(grow.defaultPrevented).toBe(true);
    expect(controller.heightPercentage).toBeGreaterThan(56);
    expect(
      stage.style.getPropertyValue("--wzc-camera-stage-runtime-aspect-ratio"),
    ).not.toBe("");

    const reset = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "Home",
    });
    controller.handleKeyDown(reset);
    expect(reset.defaultPrevented).toBe(true);
    expect(
      stage.style.getPropertyValue("--wzc-camera-stage-runtime-aspect-ratio"),
    ).toBe("");
  });

  it("resets the stage with a double mouse or touch activation", () => {
    const { handle, stage } = createElements();
    const controller = new CameraStageResizeController(createHost());
    controller.observe(stage, handle);
    connectPointerEvents(handle, controller);
    controller.handleKeyDown(
      new KeyboardEvent("keydown", { cancelable: true, key: "End" }),
    );
    expect(
      stage.style.getPropertyValue("--wzc-camera-stage-runtime-aspect-ratio"),
    ).toBe("1");

    for (let index = 0; index < 2; index += 1) {
      handle.dispatchEvent(
        pointerEvent("pointerdown", {
          clientX: 200,
          clientY: 100,
          pointerType: "touch",
        }),
      );
      handle.dispatchEvent(
        pointerEvent("pointerup", {
          clientX: 200,
          clientY: 100,
          pointerType: "touch",
        }),
      );
    }
    expect(
      stage.style.getPropertyValue("--wzc-camera-stage-runtime-aspect-ratio"),
    ).toBe("");
  });

  it("resets transient size when camera identity changes", () => {
    const { handle, stage } = createElements();
    const controller = new CameraStageResizeController(createHost());
    controller.observe(stage, handle);
    controller.handleKeyDown(
      new KeyboardEvent("keydown", { cancelable: true, key: "End" }),
    );
    expect(
      stage.style.getPropertyValue("--wzc-camera-stage-runtime-aspect-ratio"),
    ).toBe("1");

    controller.configure("camera.front");
    expect(
      stage.style.getPropertyValue("--wzc-camera-stage-runtime-aspect-ratio"),
    ).toBe("");
  });

  it("does not escape a stage height constrained by its parent layout", () => {
    const { handle, stage } = createElements();
    Object.defineProperty(stage, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 180,
        height: 180,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });
    const controller = new CameraStageResizeController(createHost());
    controller.observe(stage, handle);
    controller.handleKeyDown(
      new KeyboardEvent("keydown", { cancelable: true, key: "End" }),
    );

    expect(
      stage.style.getPropertyValue("--wzc-camera-stage-runtime-aspect-ratio"),
    ).toBe("");
  });
});
