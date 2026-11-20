import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraSelectionContext } from "../src/stage/camera-selection-context";
import { ModuleStackNavigationContext } from "../src/stage/module-stack-navigation-context";
import type { ActivityNavigationModule } from "../src/stage/modules/activity-navigation/activity-navigation";
import "../src/stage/modules/activity-navigation/activity-navigation";

describe("activity navigation", () => {
  afterEach(() => document.body.replaceChildren());

  it("shows PTZ only for configured active cameras and falls back to Reviews", async () => {
    const selected = vi.fn();
    const cameraSelection = new CameraSelectionContext();
    const navigation = new ModuleStackNavigationContext(selected);
    const element = document.createElement(
      "wzc-activity-navigation",
    ) as ActivityNavigationModule;
    element.cameraSelection = cameraSelection;
    element.navigationContext = navigation;
    element.targetStackId = "activity-stack";
    document.body.append(element);
    navigation.publish("activity-stack", {
      activeId: "reviews",
      items: [
        {
          config: {},
          icon: "reviews",
          id: "reviews",
          labelKey: "navigation.reviews",
        },
        {
          config: {
            cameraEntityIds: ["camera.front"],
            targetModuleId: "camera-module",
          },
          icon: "ptz",
          id: "ptz-panel",
          labelKey: "navigation.ptz",
        },
      ],
    });
    cameraSelection.publish(
      "camera-module",
      {},
      { activeEntityId: "camera.back", items: [] },
      vi.fn(),
    );

    await element.updateComplete;
    expect(element.shadowRoot?.querySelectorAll("button")).toHaveLength(1);

    cameraSelection.publish(
      "camera-module",
      {},
      { activeEntityId: "camera.front", items: [] },
      vi.fn(),
    );
    await element.updateComplete;
    expect(element.shadowRoot?.querySelectorAll("button")).toHaveLength(2);

    navigation.publish("activity-stack", {
      activeId: "ptz-panel",
      items: [
        {
          config: {},
          icon: "reviews",
          id: "reviews",
          labelKey: "navigation.reviews",
        },
        {
          config: {
            cameraEntityIds: ["camera.front"],
            targetModuleId: "camera-module",
          },
          icon: "ptz",
          id: "ptz-panel",
          labelKey: "navigation.ptz",
        },
      ],
    });
    cameraSelection.publish(
      "camera-module",
      {},
      { activeEntityId: "camera.back", items: [] },
      vi.fn(),
    );

    expect(selected).toHaveBeenLastCalledWith("activity-stack", "reviews");
  });
});
