import { afterEach, describe, expect, it, vi } from "vitest";

import "../src/stage/modules/minimal-camera/minimal-camera";
import type { MinimalCameraModule } from "../src/stage/modules/minimal-camera/minimal-camera";

describe("minimal camera module", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("performs the default surface action without treating controls as taps", async () => {
    vi.useFakeTimers();
    const camera = document.createElement(
      "wzc-minimal-camera",
    ) as MinimalCameraModule;
    camera.camera = {
      connection: "home_assistant",
      entityId: "camera.front",
      frigateFallback: "mse",
      lowLatencyHls: true,
      startUnmutedPcTablet: false,
      startUnmutedPhone: false,
      title: "Front",
    };
    const moreInfo = vi.fn();
    camera.addEventListener("hass-more-info", moreInfo);
    document.body.append(camera);
    await camera.updateComplete;

    camera.shadowRoot
      ?.querySelector<HTMLElement>(".viewport")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    expect(moreInfo).toHaveBeenCalledOnce();
    expect((moreInfo.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      entityId: "camera.front",
    });

    camera.shadowRoot?.querySelector<HTMLButtonElement>("button")?.click();
    await vi.advanceTimersByTimeAsync(250);
    expect(moreInfo).toHaveBeenCalledOnce();
  });

  it("uses the configured double-tap action instead of also firing tap", async () => {
    vi.useFakeTimers();
    const camera = document.createElement(
      "wzc-minimal-camera",
    ) as MinimalCameraModule;
    camera.camera = {
      connection: "home_assistant",
      entityId: "camera.front",
      frigateFallback: "mse",
      lowLatencyHls: true,
      startUnmutedPcTablet: false,
      startUnmutedPhone: false,
      title: "Front",
    };
    camera.doubleTapAction = { action: "more-info" };
    camera.tapAction = { action: "none" };
    const moreInfo = vi.fn();
    camera.addEventListener("hass-more-info", moreInfo);
    document.body.append(camera);
    await camera.updateComplete;
    const viewport = camera.shadowRoot?.querySelector<HTMLElement>(".viewport");

    viewport?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    viewport?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    viewport?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(250);
    expect(moreInfo).toHaveBeenCalledOnce();
  });
});
