import { afterEach, describe, expect, it, vi } from "vitest";

import type { CameraSwitcherComponent } from "../src/stage/components/camera-switcher/camera-switcher";
import { CameraSelectionContext } from "../src/stage/camera-selection-context";
import { CameraSessionContext } from "../src/stage/camera-session-context";
import "../src/stage/components/camera-switcher/camera-switcher";

describe("camera switcher component", () => {
  afterEach(() => document.body.replaceChildren());

  it("shares camera selection while omitting activity indicators", async () => {
    const selection = new CameraSelectionContext();
    const sessions = new CameraSessionContext();
    const select = vi.fn();
    const releaseHold = vi.fn();
    const element = document.createElement(
      "wzc-camera-switcher",
    ) as CameraSwitcherComponent;
    element.cameraSelection = selection;
    element.cameraSession = sessions;
    element.targetModuleId = "camera-module";
    document.body.append(element);

    selection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.front",
        items: [
          { activity: "alert", entityId: "camera.front", label: "Front" },
          {
            activity: "detection",
            entityId: "camera.back",
            label: "Back",
          },
        ],
      },
      select,
    );
    sessions.publish(
      {},
      {
        available: true,
        connection: "home_assistant",
        entityId: "camera.front",
        holdOverlay: vi.fn(() => releaseHold),
        muted: true,
        overlayVisible: true,
        revealOverlay: vi.fn(),
        setMuted: vi.fn(),
        setTalkAudioActive: vi.fn(),
      },
    );

    await element.updateComplete;
    const trigger =
      element.shadowRoot?.querySelector<HTMLButtonElement>("button.trigger");
    expect(trigger?.textContent).toContain("Front");
    trigger?.click();
    await element.updateComplete;
    const options = element.shadowRoot?.querySelectorAll("button.option");
    expect(options).toHaveLength(2);
    expect(element.shadowRoot?.querySelector("svg")).not.toBeNull();
    expect(element.shadowRoot?.querySelectorAll(".option svg")).toHaveLength(0);

    (options?.[1] as HTMLButtonElement | undefined)?.click();
    expect(select).toHaveBeenCalledWith("camera.back");
    expect(releaseHold).toHaveBeenCalledOnce();
  });

  it("does not render for a single configured camera", async () => {
    const selection = new CameraSelectionContext();
    const sessions = new CameraSessionContext();
    const element = document.createElement(
      "wzc-camera-switcher",
    ) as CameraSwitcherComponent;
    element.cameraSelection = selection;
    element.cameraSession = sessions;
    element.targetModuleId = "camera-module";
    document.body.append(element);
    selection.publish(
      "camera-module",
      {},
      {
        activeEntityId: "camera.front",
        items: [{ entityId: "camera.front", label: "Front" }],
      },
      vi.fn(),
    );
    sessions.publish(
      {},
      {
        available: true,
        connection: "home_assistant",
        entityId: "camera.front",
        holdOverlay: vi.fn(() => vi.fn()),
        muted: true,
        overlayVisible: true,
        revealOverlay: vi.fn(),
        setMuted: vi.fn(),
        setTalkAudioActive: vi.fn(),
      },
    );
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector(".switcher")).toBeNull();
  });
});
