import { describe, expect, it, vi } from "vitest";

import { CameraSelectionContext } from "../src/stage/camera-selection-context";

describe("camera selection context", () => {
  it("coordinates one camera module without leaking into another", () => {
    const context = new CameraSelectionContext();
    const firstListener = vi.fn();
    const secondListener = vi.fn();
    const select = vi.fn();
    context.subscribe("first", firstListener);
    context.subscribe("second", secondListener);

    context.publish(
      "first",
      {},
      {
        activeEntityId: "camera.front",
        items: [
          { entityId: "camera.front", label: "Front" },
          { entityId: "camera.back", label: "Back" },
        ],
      },
      select,
    );

    expect(firstListener).toHaveBeenLastCalledWith({
      activeEntityId: "camera.front",
      items: [
        { entityId: "camera.front", label: "Front" },
        { entityId: "camera.back", label: "Back" },
      ],
    });
    expect(secondListener).toHaveBeenCalledOnce();
    expect(context.select("first", "camera.back")).toBe(true);
    expect(select).toHaveBeenCalledWith("camera.back");
    expect(context.select("second", "camera.back")).toBe(false);
  });

  it("only lets the current publisher clear a selection channel", () => {
    const context = new CameraSelectionContext();
    const owner = {};
    const listener = vi.fn();
    context.subscribe("camera", listener);
    context.publish(
      "camera",
      owner,
      {
        activeEntityId: "camera.front",
        items: [{ entityId: "camera.front", label: "Front" }],
      },
      vi.fn(),
    );

    context.clear("camera", {});
    expect(listener).toHaveBeenCalledTimes(2);
    context.clear("camera", owner);
    expect(listener).toHaveBeenLastCalledWith({ items: [] });
  });

  it("does not let a stale unsubscribe delete a replacement channel", () => {
    const context = new CameraSelectionContext();
    const oldOwner = {};
    const unsubscribe = context.subscribe("camera", vi.fn());
    context.publish(
      "camera",
      oldOwner,
      {
        activeEntityId: "camera.front",
        items: [{ entityId: "camera.front", label: "Front" }],
      },
      vi.fn(),
    );
    unsubscribe();
    context.clear("camera", oldOwner);

    const select = vi.fn();
    context.publish(
      "camera",
      {},
      {
        activeEntityId: "camera.front",
        items: [
          { entityId: "camera.front", label: "Front" },
          { entityId: "camera.back", label: "Back" },
        ],
      },
      select,
    );
    unsubscribe();

    expect(context.select("camera", "camera.back")).toBe(true);
    expect(select).toHaveBeenCalledWith("camera.back");
  });
});
