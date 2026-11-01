import { afterEach, describe, expect, it } from "vitest";

import type { CameraModule } from "../src/modules/camera";
import type { CameraLiveView } from "../src/modules/camera/live-view";
import "../src/modules/camera";

afterEach(() => {
  document.body.replaceChildren();
});

describe("camera presentation fallback", () => {
  it("reveals the generic themed layer when the HA poster fails", async () => {
    const camera = document.createElement(
      "watchzone-camera-live-view",
    ) as CameraLiveView;
    camera.posterUrl = "/api/camera_proxy/camera.front?token=test";
    document.body.append(camera);
    await camera.updateComplete;

    const poster = camera.shadowRoot?.querySelector("img.poster");
    expect(poster?.getAttribute("src")).toContain("camera.front");
    expect(
      camera.shadowRoot?.querySelector(".generic-fallback"),
    ).not.toBeNull();

    poster?.dispatchEvent(new Event("error"));
    await camera.updateComplete;

    expect(camera.shadowRoot?.querySelector("img.poster")).toBeNull();
    expect(
      camera.shadowRoot?.querySelector(".generic-fallback"),
    ).not.toBeNull();
  });
});

describe("camera component appearance", () => {
  it("applies independent corner and shadow inputs", async () => {
    const camera = document.createElement("watchzone-camera") as CameraModule;
    document.body.append(camera);
    await camera.updateComplete;

    expect(camera.shadowRoot?.querySelector(".camera")?.className).toBe(
      "camera",
    );

    camera.roundedCorners = false;
    camera.shadowStyle = "small";
    await camera.updateComplete;

    expect(camera.shadowRoot?.querySelector(".camera")?.className).toBe(
      "camera square-camera-corners camera-shadow-small",
    );

    camera.shadowStyle = "none";
    await camera.updateComplete;
    expect(camera.shadowRoot?.querySelector(".camera")?.className).toBe(
      "camera square-camera-corners camera-shadow-none",
    );
  });
});
