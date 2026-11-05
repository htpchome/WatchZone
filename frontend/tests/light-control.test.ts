import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  componentDefinition,
  type LightControlComponentConfig,
} from "../src/components/light-control";
import type { LightControlComponent } from "../src/components/light-control/light-control";
import { CameraSessionContext } from "../src/core/camera-session-context";
import { LIGHT_LONG_PRESS_MS, LIGHT_TAG } from "../src/core/constants";
import type { HomeAssistant } from "../src/core/home-assistant";
import "../src/components/light-control/light-control";

describe("linked-light component", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("validates one or two unique light entities per camera", () => {
    expect(
      componentDefinition.validateConfig({
        cameras: [
          {
            cameraEntityId: "camera.front",
            lights: [
              {
                entityId: "light.porch",
                icon: "mdi:lightbulb-off-outline",
              },
              { entityId: "light.driveway", icon: "mdi:coach-lamp" },
            ],
          },
        ],
      }),
    ).toEqual({
      cameras: [
        {
          cameraEntityId: "camera.front",
          lights: [
            {
              entityId: "light.porch",
              icon: "mdi:lightbulb-off-outline",
            },
            { entityId: "light.driveway", icon: "mdi:coach-lamp" },
          ],
        },
      ],
    });
    expect(() =>
      componentDefinition.validateConfig({
        cameras: [
          {
            cameraEntityId: "camera.front",
            lights: ["one", "two", "three"].map((id) => ({
              entityId: `light.${id}`,
              icon: "mdi:lightbulb-off-outline",
            })),
          },
        ],
      }),
    ).toThrow("one or two unique light entities");
  });

  it("toggles on short press and opens brightness controls on long press", async () => {
    const callService = vi.fn(async () => undefined);
    const context = new CameraSessionContext();
    const element = document.createElement(LIGHT_TAG) as LightControlComponent;
    element.cameraSession = context;
    element.cameras = cameraLights({
      "camera.front": ["light.porch"],
    });
    element.hass = createHass(callService);
    document.body.append(element);
    await element.updateComplete;
    context.publish({}, activeCamera("camera.front"));
    await element.updateComplete;

    const button = element.shadowRoot?.querySelector(
      ".light-button",
    ) as HTMLButtonElement;
    expect(button.title).toBe("Turn off Porch");
    expect(button.ariaLabel).toBe("Turn off Porch");
    expect(button.style.getPropertyValue("--wzc-light-level")).toBe("50%");
    expect(
      (button.querySelector("ha-icon") as HTMLElement & { icon: string }).icon,
    ).toBe("mdi:lightbulb-on-outline");

    pressKey(button, " ", "keydown");
    pressKey(button, " ", "keyup");
    expect(callService).toHaveBeenCalledWith("light", "turn_off", undefined, {
      entity_id: "light.porch",
    });
    callService.mockClear();

    pressKey(button, " ", "keydown");
    await vi.advanceTimersByTimeAsync(LIGHT_LONG_PRESS_MS);
    await element.updateComplete;
    expect(callService).not.toHaveBeenCalled();
    const panel = element.shadowRoot?.querySelector(".dimmer-panel");
    expect(panel?.getAttribute("role")).toBe("dialog");
    expect(panel?.querySelector(".brightness-value")?.textContent).toBe("50%");
    const slider = panel?.querySelector("ha-control-slider") as HTMLElement;
    slider.dispatchEvent(
      new CustomEvent("slider-moved", {
        bubbles: true,
        detail: { value: 72 },
      }),
    );
    slider.dispatchEvent(
      new CustomEvent("value-changed", {
        bubbles: true,
        detail: { value: 72 },
      }),
    );
    expect(callService).toHaveBeenCalledWith(
      "light",
      "turn_on",
      { brightness_pct: 72 },
      { entity_id: "light.porch" },
    );
    pressKey(button, " ", "keyup");
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector(".dimmer-panel")).toBeNull();
  });

  it("switches linked controls with the active camera and cleans up presses", async () => {
    const callService = vi.fn(async () => undefined);
    const context = new CameraSessionContext();
    const element = document.createElement(LIGHT_TAG) as LightControlComponent;
    element.cameraSession = context;
    element.cameras = cameraLights({
      "camera.front": ["light.porch"],
      "camera.back": ["light.yard"],
    });
    element.hass = createHass(callService);
    document.body.append(element);
    await element.updateComplete;

    context.publish({}, activeCamera("camera.front"));
    await element.updateComplete;
    expect(
      element.shadowRoot
        ?.querySelector(".light-button")
        ?.getAttribute("data-light-id"),
    ).toBe("light.porch");

    context.publish({}, activeCamera("camera.back"));
    await element.updateComplete;
    const button = element.shadowRoot?.querySelector(
      ".light-button",
    ) as HTMLButtonElement;
    expect(button.dataset.lightId).toBe("light.yard");
    pressKey(button, "Enter", "keydown");
    element.remove();
    await vi.advanceTimersByTimeAsync(LIGHT_LONG_PRESS_MS);
    expect(callService).not.toHaveBeenCalled();
  });
});

function cameraLights(
  cameras: Readonly<Record<string, readonly string[]>>,
): LightControlComponentConfig["cameras"] {
  return Object.entries(cameras).map(([cameraEntityId, entityIds]) => ({
    cameraEntityId,
    lights: entityIds.map((entityId) => ({
      entityId,
      icon: "mdi:lightbulb-off-outline",
    })),
  }));
}

function createHass(
  callService: (
    domain: string,
    service: string,
    data?: Readonly<Record<string, unknown>>,
    target?: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>,
): HomeAssistant {
  const states = {
    "light.porch": {
      entity_id: "light.porch",
      state: "on",
      attributes: { brightness: 128, friendly_name: "Porch" },
    },
    "light.yard": {
      entity_id: "light.yard",
      state: "off",
      attributes: { friendly_name: "Yard" },
    },
  };
  return {
    states,
    connection: { subscribeMessage: async () => () => undefined },
    callService: async <T>(
      domain: string,
      service: string,
      data?: Readonly<Record<string, unknown>>,
      target?: Readonly<Record<string, unknown>>,
    ) => {
      await callService(domain, service, data, target);
      return undefined as T;
    },
    callWS: async () => undefined as never,
    hassUrl: (path) => path,
  };
}

function activeCamera(entityId: string) {
  return {
    available: true,
    entityId,
    muted: true,
    overlayVisible: true,
    holdOverlay: () => () => undefined,
    revealOverlay: vi.fn(),
    setMuted: vi.fn(),
    setTalkAudioActive: vi.fn(),
  };
}

function pressKey(
  element: HTMLElement,
  key: string,
  type: "keydown" | "keyup",
): void {
  element.dispatchEvent(
    new KeyboardEvent(type, { bubbles: true, cancelable: true, key }),
  );
}
