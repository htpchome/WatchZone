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
              { entityId: "light.porch", icon: "mdi:coach-lamp" },
              { entityId: "light.driveway" },
            ],
          },
        ],
      }),
    ).toEqual({
      cameras: [
        {
          cameraEntityId: "camera.front",
          lights: [
            { entityId: "light.porch", icon: "mdi:coach-lamp" },
            { entityId: "light.driveway" },
          ],
        },
      ],
    });
    expect(() =>
      componentDefinition.validateConfig({
        cameras: [
          {
            cameraEntityId: "camera.front",
            lights: [
              { entityId: "light.one" },
              { entityId: "light.two" },
              { entityId: "light.three" },
            ],
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
    const slider = panel?.querySelector("ha-control-slider") as HTMLElement;
    expect(slider.hasAttribute("vertical")).toBe(true);
    expect(slider.hasAttribute("show-handle")).toBe(true);
    expect(slider.getAttribute("tooltip-mode")).toBe("interaction");
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
    document.body.dispatchEvent(
      new Event("pointerdown", { bubbles: true, composed: true }),
    );
    await element.updateComplete;
    expect(element.shadowRoot?.querySelector(".dimmer-panel")).toBeNull();
    pressKey(button, " ", "keyup");
  });

  it("holds the shared overlay while its controls are hovered", async () => {
    const release = vi.fn();
    const holdOverlay = vi.fn(() => release);
    const revealOverlay = vi.fn();
    const context = new CameraSessionContext();
    const element = document.createElement(LIGHT_TAG) as LightControlComponent;
    element.cameraSession = context;
    element.cameras = [
      {
        cameraEntityId: "camera.front",
        lights: [{ entityId: "light.porch", icon: "mdi:coach-lamp" }],
      },
    ];
    element.hass = createHass(vi.fn(async () => undefined));
    document.body.append(element);
    context.publish(
      {},
      Object.assign(activeCamera("camera.front"), {
        holdOverlay,
        revealOverlay,
      }),
    );
    await element.updateComplete;

    const controls = element.shadowRoot?.querySelector(
      ".light-buttons",
    ) as HTMLElement;
    controls.dispatchEvent(new Event("pointerenter"));
    expect(holdOverlay).toHaveBeenCalledOnce();
    expect(revealOverlay).toHaveBeenCalledOnce();
    controls.dispatchEvent(new Event("pointerleave"));
    expect(release).toHaveBeenCalledOnce();
    expect(
      (
        element.shadowRoot?.querySelector("ha-icon") as
          (HTMLElement & { icon?: string }) | null
      )?.icon,
    ).toBe("mdi:coach-lamp");
  });

  it("uses the restored Home Assistant light state after a restart", async () => {
    const context = new CameraSessionContext();
    const element = document.createElement(LIGHT_TAG) as LightControlComponent;
    element.cameraSession = context;
    element.cameras = cameraLights({
      "camera.front": ["light.porch"],
    });
    element.hass = createHass(vi.fn(async () => undefined));
    document.body.append(element);
    context.publish({}, activeCamera("camera.front"));
    await element.updateComplete;

    expect(
      element.shadowRoot
        ?.querySelector(".light-button")
        ?.getAttribute("aria-pressed"),
    ).toBe("true");

    const restored = createHass(vi.fn(async () => undefined));
    element.hass = {
      ...restored,
      states: {
        ...restored.states,
        "light.porch": {
          entity_id: "light.porch",
          state: "off",
          attributes: { brightness: 128, friendly_name: "Porch" },
        },
      },
    };
    await element.updateComplete;

    const button = element.shadowRoot?.querySelector(
      ".light-button",
    ) as HTMLElement;
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.getAttribute("style")).toContain("--wzc-light-level:0%");
    expect(button.querySelector("svg")).not.toBeNull();
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
  return Object.entries(cameras).map(([cameraEntityId, lightEntityIds]) => ({
    cameraEntityId,
    lights: lightEntityIds.map((entityId) => ({ entityId })),
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
