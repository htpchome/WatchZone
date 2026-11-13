import { afterEach, describe, expect, it, vi } from "vitest";

import { ACTIVITY_TAKEOVER_TOGGLE_TAG } from "../src/core/constants";
import "../src/stage/activity";
import type { ActivityTakeoverToggle } from "../src/stage/activity";
import { CameraSelectionContext } from "../src/stage/camera-selection-context";

describe("activity takeover toggle", () => {
  afterEach(() => document.body.replaceChildren());

  it("shows the inactive color immediately after toggling off under a pointer", async () => {
    const cameraSelection = new CameraSelectionContext();
    const toggle = vi.fn();
    const owner = {};
    const element = document.createElement(
      ACTIVITY_TAKEOVER_TOGGLE_TAG,
    ) as ActivityTakeoverToggle;
    element.cameraSelection = cameraSelection;
    element.targetModuleId = "camera-module";
    document.body.append(element);
    cameraSelection.publish(
      "camera-module",
      owner,
      {
        items: [],
        takeoverAvailable: true,
        takeoverEnabled: true,
      },
      vi.fn(),
      toggle,
    );
    await element.updateComplete;

    element.shadowRoot?.querySelector<HTMLButtonElement>("button")?.click();
    cameraSelection.publish(
      "camera-module",
      owner,
      {
        items: [],
        takeoverAvailable: true,
        takeoverEnabled: false,
      },
      vi.fn(),
      toggle,
    );
    await element.updateComplete;

    const button =
      element.shadowRoot?.querySelector<HTMLButtonElement>("button");
    expect(toggle).toHaveBeenCalledOnce();
    expect(button?.getAttribute("aria-pressed")).toBe("false");
    expect(button?.classList.contains("suppress-inactive-hover")).toBe(true);

    button?.dispatchEvent(new PointerEvent("pointerleave"));
    await element.updateComplete;
    expect(button?.classList.contains("suppress-inactive-hover")).toBe(false);
  });
});
