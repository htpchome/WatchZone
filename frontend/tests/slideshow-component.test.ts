import { afterEach, describe, expect, it, vi } from "vitest";

import { SLIDESHOW_TAG } from "../src/core/constants";
import { CameraSelectionContext } from "../src/stage/camera-selection-context";
import { CameraSessionContext } from "../src/stage/camera-session-context";
import "../src/stage/components/slideshow/slideshow";
import type { SlideshowComponent } from "../src/stage/components/slideshow/slideshow";

describe("slideshow overlay component", () => {
  afterEach(() => document.body.replaceChildren());

  it("stays dimmed with a countdown while active and presents takeover hold", async () => {
    const selection = new CameraSelectionContext();
    const session = new CameraSessionContext();
    const toggle = vi.fn();
    const element = document.createElement(SLIDESHOW_TAG) as SlideshowComponent;
    element.cameraSelection = selection;
    element.cameraSession = session;
    element.targetModuleId = "camera-module";
    document.body.append(element);
    session.publish(
      {},
      {
        available: true,
        connection: "home_assistant",
        entityId: "camera.front",
        holdOverlay: () => vi.fn(),
        muted: true,
        overlayVisible: false,
        revealOverlay: vi.fn(),
        setMuted: vi.fn(),
        setTalkAudioActive: vi.fn(),
      },
    );
    selection.publish(
      "camera-module",
      {},
      {
        items: [
          { entityId: "camera.front", label: "Front" },
          { entityId: "camera.back", label: "Back" },
        ],
        slideshowAvailable: true,
        slideshowEnabled: true,
        slideshowHeld: false,
        slideshowRemainingSeconds: 9,
      },
      vi.fn(),
      undefined,
      undefined,
      toggle,
    );
    await element.updateComplete;

    let button = element.shadowRoot?.querySelector<HTMLButtonElement>("button");
    expect(button?.classList.contains("visible")).toBe(true);
    expect(button?.classList.contains("dimmed")).toBe(true);
    expect(button?.textContent).toContain("9s");

    selection.publish(
      "camera-module",
      {},
      {
        items: [
          { entityId: "camera.front", label: "Front" },
          { entityId: "camera.back", label: "Back" },
        ],
        slideshowAvailable: true,
        slideshowEnabled: true,
        slideshowHeld: true,
        slideshowRemainingSeconds: 9,
      },
      vi.fn(),
      undefined,
      undefined,
      toggle,
    );
    await element.updateComplete;

    button = element.shadowRoot?.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toContain("Hold");
    button?.click();
    expect(toggle).toHaveBeenCalledOnce();
  });
});
