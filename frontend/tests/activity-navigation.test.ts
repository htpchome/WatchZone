import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActivityNavigationModule } from "../src/stage/modules/activity-navigation/activity-navigation";
import { CameraSessionContext } from "../src/stage/camera-session-context";
import { ModuleStackNavigationContext } from "../src/stage/module-stack-navigation-context";
import "../src/stage/modules/activity-navigation/activity-navigation";

describe("activity navigation", () => {
  afterEach(() => document.body.replaceChildren());

  it("renders one adaptive camera-controls button for the active camera", async () => {
    const selected = vi.fn();
    const owner = {};
    const navigation = new ModuleStackNavigationContext(selected);
    navigation.publish("activity-stack", {
      activeId: "camera-controls",
      items: [
        {
          entityIcons: {
            "camera.both": ["microphone", "ptz"],
            "camera.ptz": ["ptz"],
          },
          id: "camera-controls",
          labelKey: "navigation.camera_controls",
        },
      ],
    });
    const cameras = new CameraSessionContext();
    const element = document.createElement(
      "wzc-activity-navigation",
    ) as ActivityNavigationModule;
    element.cameraSession = cameras;
    element.navigationContext = navigation;
    element.targetStackId = "activity-stack";
    document.body.append(element);

    cameras.publish(owner, cameraSession("camera.both"));
    await element.updateComplete;
    const joined = element.shadowRoot?.querySelector("button.joined");
    expect(joined).not.toBeNull();
    expect(joined?.querySelectorAll("svg")).toHaveLength(2);
    expect(element.shadowRoot?.querySelectorAll("button")).toHaveLength(1);

    cameras.clear(owner);
    await element.updateComplete;
    expect(selected).not.toHaveBeenCalled();

    cameras.publish(owner, cameraSession("camera.ptz"));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector("button.joined")).toBeNull();
    expect(element.shadowRoot?.querySelectorAll("button svg")).toHaveLength(1);

    cameras.publish(owner, cameraSession("camera.none"));
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector("button")).toBeNull();
  });
});

function cameraSession(entityId: string) {
  return {
    available: true,
    connection: "home_assistant" as const,
    entityId,
    holdOverlay: vi.fn(() => vi.fn()),
    muted: true,
    overlayVisible: true,
    revealOverlay: vi.fn(),
    setMuted: vi.fn(),
    setTalkAudioActive: vi.fn(),
  };
}
