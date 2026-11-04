import { afterEach, describe, expect, it } from "vitest";

import type { CameraModule } from "../src/modules/camera/camera";
import type { CameraView } from "../src/modules/camera/camera-view";
import type { CameraLivePresentation } from "../src/modules/camera/live/presentation";
import "../src/modules/camera/camera";
import "../src/modules/camera/camera-view";
import "../src/modules/camera/live/presentation";

afterEach(() => {
  document.body.replaceChildren();
});

describe("camera presentation fallback", () => {
  it("reveals the generic themed layer when the HA poster fails", async () => {
    const camera = document.createElement(
      "wzc-camera-live",
    ) as CameraLivePresentation;
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

    camera.available = true;
    camera.failed = true;
    await camera.updateComplete;
    expect(camera.shadowRoot?.querySelector(".source-indicator")).toBeNull();
    expect(camera.shadowRoot?.querySelector(".status")).toBeNull();
  });

  it("distinguishes standard and low-latency HLS while retaining the engine", async () => {
    const presentation = document.createElement(
      "wzc-camera-live",
    ) as CameraLivePresentation;
    presentation.available = true;
    presentation.selected = "hls";
    presentation.transport = "hls_mse";
    presentation.lowLatencyHls = true;
    document.body.append(presentation);
    await presentation.updateComplete;
    expect(
      presentation.shadowRoot
        ?.querySelector(".source-indicator")
        ?.textContent?.trim(),
    ).toBe("HLS-LL · HLS.js");

    presentation.lowLatencyHls = false;
    await presentation.updateComplete;
    expect(
      presentation.shadowRoot
        ?.querySelector(".source-indicator")
        ?.textContent?.trim(),
    ).toBe("HLS · HLS.js");
  });
});

describe("camera component appearance", () => {
  it("keeps the live presentation inside one non-interactive camera slide", async () => {
    const camera = document.createElement("wzc-camera") as CameraModule;
    camera.cameras = [cameraItem("camera.front")];
    document.body.append(camera);
    await camera.updateComplete;

    const carousel = camera.shadowRoot?.querySelector(".camera-carousel");
    const wrapper = carousel?.querySelector(".swiper-wrapper");
    const slides = wrapper?.querySelectorAll(".swiper-slide");
    const presentation = slides?.[0]?.querySelector("wzc-camera-view");

    expect(carousel?.getAttribute("aria-roledescription")).toBe("carousel");
    expect(carousel?.classList.contains("camera-carousel-interactive")).toBe(
      false,
    );
    expect(slides).toHaveLength(1);
    expect(slides?.[0]?.getAttribute("aria-roledescription")).toBe("slide");
    expect(presentation).not.toBeNull();
  });

  it("applies independent corner and shadow inputs", async () => {
    const camera = document.createElement("wzc-camera") as CameraModule;
    camera.cameras = [cameraItem("camera.front")];
    document.body.append(camera);
    await camera.updateComplete;

    expect(
      camera.shadowRoot?.querySelector(".camera-carousel")?.className,
    ).toBe("camera-carousel swiper");

    camera.roundedCorners = false;
    camera.shadowStyle = "small";
    await camera.updateComplete;

    expect(
      camera.shadowRoot?.querySelector(".camera-carousel")?.className,
    ).toBe("camera-carousel swiper square-camera-corners camera-shadow-small");

    camera.shadowStyle = "none";
    await camera.updateComplete;
    expect(
      camera.shadowRoot?.querySelector(".camera-carousel")?.className,
    ).toBe("camera-carousel swiper square-camera-corners camera-shadow-none");
  });

  it("connects only the selected camera while retaining ordered slides", async () => {
    const camera = document.createElement("wzc-camera") as CameraModule;
    camera.cameras = [
      cameraItem("camera.zero"),
      cameraItem("camera.one"),
      cameraItem("camera.two"),
    ];
    document.body.append(camera);
    await camera.updateComplete;
    const views = [
      ...(camera.shadowRoot?.querySelectorAll<CameraView>("wzc-camera-view") ??
        []),
    ];
    expect(views).toHaveLength(3);
    expect(views.map(({ connect }) => connect)).toEqual([true, false, false]);

    camera.shadowRoot
      ?.querySelector<HTMLButtonElement>(".carousel-navigation.next")
      ?.click();
    await camera.updateComplete;
    expect(views.map(({ active }) => active)).toEqual([false, true, false]);
    expect(views.map(({ connect }) => connect)).toEqual([false, true, false]);
  });

  it("moves connection ownership immediately with rapid selection", async () => {
    const camera = document.createElement("wzc-camera") as CameraModule;
    camera.cameras = [
      cameraItem("camera.zero"),
      cameraItem("camera.one"),
      cameraItem("camera.two"),
    ];
    document.body.append(camera);
    await camera.updateComplete;

    camera.shadowRoot
      ?.querySelector<HTMLButtonElement>(".carousel-navigation.next")
      ?.click();
    await camera.updateComplete;

    const views = [
      ...(camera.shadowRoot?.querySelectorAll<CameraView>("wzc-camera-view") ??
        []),
    ];
    expect(views.map(({ active }) => active)).toEqual([false, true, false]);
    expect(views.map(({ connect }) => connect)).toEqual([false, true, false]);

    camera.shadowRoot
      ?.querySelector<HTMLButtonElement>(".carousel-navigation.next")
      ?.click();
    await camera.updateComplete;
    expect(views.map(({ active }) => active)).toEqual([false, false, true]);
    expect(views.map(({ connect }) => connect)).toEqual([false, false, true]);
  });

  it("keeps one shared stage height while changing camera slides", async () => {
    const camera = document.createElement("wzc-camera") as CameraModule;
    camera.cameras = [cameraItem("camera.zero"), cameraItem("camera.one")];
    document.body.append(camera);
    await camera.updateComplete;
    const views = [
      ...(camera.shadowRoot?.querySelectorAll<CameraView>("wzc-camera-view") ??
        []),
    ];
    const firstHandle = views[0].shadowRoot?.querySelector<HTMLButtonElement>(
      ".stage-resize-handle",
    );

    firstHandle?.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "End",
      }),
    );
    await camera.updateComplete;
    await Promise.all(views.map((view) => view.updateComplete));

    expect(views.map(({ stageHeightRatio }) => stageHeightRatio)).toEqual([
      1, 1,
    ]);
    expect(views.map(({ stageResized }) => stageResized)).toEqual([true, true]);
    expect(
      views.map((view) =>
        view.shadowRoot
          ?.querySelector(".camera")
          ?.classList.contains("stage-resized"),
      ),
    ).toEqual([true, true]);

    camera.shadowRoot
      ?.querySelector<HTMLButtonElement>(".carousel-navigation.next")
      ?.click();
    await camera.updateComplete;
    await Promise.all(views.map((view) => view.updateComplete));

    expect(views.map(({ active }) => active)).toEqual([false, true]);
    expect(
      views[1].shadowRoot
        ?.querySelector<HTMLElement>(".camera")
        ?.style.getPropertyValue("--wzc-camera-stage-runtime-aspect-ratio"),
    ).toBe("1");
  });
});

function cameraItem(entityId: string) {
  return {
    available: true,
    entityId,
    lowLatencyHls: true,
    startUnmutedPcTablet: false,
    startUnmutedPhone: false,
  };
}
