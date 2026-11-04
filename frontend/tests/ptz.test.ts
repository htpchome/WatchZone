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

import type { PtzModule } from "../src/modules/ptz/ptz";
import "../src/modules/ptz/ptz";

describe("PTZ module", () => {
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
    const element = document.createElement("wzc-ptz") as PtzModule;
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
});

function cameraSession() {
  return {
    available: true,
    entityId: "camera.front",
    holdOverlay: vi.fn(() => vi.fn()),
    muted: true,
    overlayVisible: true,
    revealOverlay: vi.fn(),
    setMuted: vi.fn(),
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
