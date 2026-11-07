import { afterEach, describe, expect, it, vi } from "vitest";

import { CameraSessionContext } from "../src/core/camera-session-context";
import type { HomeAssistantApi } from "../src/core/home-assistant";

const resolver = vi.hoisted(() => ({
  capability: vi.fn(),
  start: vi.fn(),
}));

vi.mock("../src/providers/ptz-source-resolver", () => ({
  PtzSourceResolver: class {
    public capability = resolver.capability;
    public start = resolver.start;
  },
}));

import type { PtzComponent } from "../src/components/ptz/ptz";
import { componentDefinition } from "../src/components/ptz";
import "../src/components/ptz/ptz";

describe("PTZ component", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it("renders only supported axes and stops keyboard movement on release", async () => {
    const stopMotion = vi.fn();
    resolver.capability.mockResolvedValue({
      focus: false,
      pan: false,
      presets: [],
      supported: true,
      tilt: true,
      zoom: false,
    });
    resolver.start.mockResolvedValue(stopMotion);
    const context = new CameraSessionContext();
    const element = document.createElement("wzc-ptz") as PtzComponent;
    element.api = api();
    element.cameraSession = context;
    element.cameras = [
      { entityId: "camera.front", provider: "home_assistant" },
    ];
    document.body.append(element);
    context.publish({}, cameraSession());

    await vi.waitFor(() =>
      expect(element.shadowRoot?.querySelectorAll("button")).toHaveLength(2),
    );
    const up =
      element.shadowRoot?.querySelector<HTMLButtonElement>("button.up");
    expect(up).not.toBeNull();

    up?.dispatchEvent(
      new KeyboardEvent("keydown", { key: " ", bubbles: true }),
    );
    await vi.waitFor(() => expect(resolver.start).toHaveBeenCalledOnce());
    up?.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true }));

    expect(resolver.start).toHaveBeenCalledWith(
      expect.anything(),
      "home_assistant",
      "camera.front",
      "up",
    );
    expect(stopMotion).toHaveBeenCalledOnce();
  });

  it("accepts Frigate go2rtc as a runtime PTZ provider", () => {
    expect(
      componentDefinition.validateConfig({
        cameras: [
          {
            entityId: "camera.front",
            provider: "frigate_go2rtc",
          },
        ],
      }),
    ).toEqual({
      cameras: [{ entityId: "camera.front", provider: "frigate_go2rtc" }],
    });
  });

  it("resolves active-camera capability through the Frigate provider", async () => {
    resolver.capability.mockResolvedValue({
      focus: false,
      pan: true,
      presets: [],
      supported: true,
      tilt: true,
      zoom: false,
    });
    const context = new CameraSessionContext();
    const element = document.createElement("wzc-ptz") as PtzComponent;
    const homeAssistantApi = api();
    element.api = homeAssistantApi;
    element.cameraSession = context;
    element.cameras = [
      { entityId: "camera.front", provider: "frigate_go2rtc" },
    ];
    document.body.append(element);
    context.publish(
      {},
      {
        ...cameraSession(),
        connection: "frigate_go2rtc",
      },
    );

    await vi.waitFor(() =>
      expect(resolver.capability).toHaveBeenCalledWith(
        homeAssistantApi,
        "frigate_go2rtc",
        "camera.front",
      ),
    );
    expect(element.shadowRoot?.querySelectorAll("button")).toHaveLength(4);
  });
});

function cameraSession() {
  return {
    available: true,
    connection: "home_assistant" as const,
    entityId: "camera.front",
    holdOverlay: vi.fn(() => vi.fn()),
    muted: true,
    overlayVisible: true,
    revealOverlay: vi.fn(),
    setMuted: vi.fn(),
    setTalkAudioActive: vi.fn(),
  };
}

function api(): HomeAssistantApi {
  return {
    identity: { subscribeMessage: vi.fn() },
    callWS: vi.fn(),
    resolveUrl: (path) => path,
    subscribeMessage: vi.fn(),
  };
}
